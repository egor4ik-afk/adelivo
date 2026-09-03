// src/app/api/webhooks/telegram/bot/route.ts
// Приём сообщений из чатов, куда добавлен наш бот.
//
// Существующий /api/webhooks/telegram — это отправка наружу, поэтому
// входящие обновления вынесены в отдельный путь и тот файл не трогается.
//
// Подключение вебхука у Telegram (один раз):
//   https://api.telegram.org/bot<TOKEN>/setWebhook
//     ?url=https://adelivo.ru/api/webhooks/telegram/bot
//     &secret_token=<TELEGRAM_WEBHOOK_SECRET>
//
// Бота в группе нужно сделать администратором либо выключить ему privacy mode
// через @BotFather → Group Privacy → Turn off. Иначе Telegram не отдаёт боту
// обычные сообщения группы, и вебхук будет молчать — это самая частая причина
// «настроил, а ничего не приходит».

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOrderText } from "@/lib/order-parse";
import { geocodeAddress, calcBaseDeliveryPrice } from "@/lib/crm";
import { OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

async function reply(chatId: string, text: string, replyTo?: number) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_to_message_id: replyTo,
      }),
    });
  } catch (e) {
    console.error("[TG bot] ответ не отправлен", e);
  }
}

export async function POST(req: NextRequest) {
  // Telegram шлёт секрет заголовком. Без проверки любой желающий
  // мог бы постить нам заказы, зная адрес вебхука.
  if (SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== SECRET) {
      return NextResponse.json({ ok: true }); // молча, чтобы не подсказывать
    }
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msg = (update as any).message ?? (update as any).channel_post;
  const text: string = msg?.text ?? msg?.caption ?? "";
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;

  // Telegram считает доставку успешной по коду 200. Любой другой ответ
  // заставит его повторять апдейт, поэтому дальше везде возвращаем ok.
  if (!chatId || !text || text.trim().length < 15) {
    return NextResponse.json({ ok: true });
  }

  // Служебная команда: узнать ID чата при настройке
  if (/^\/id\b/.test(text.trim())) {
    await reply(chatId, `ID этого чата: \`${chatId}\`\nВставьте его в настройках компании.`, msg.message_id);
    return NextResponse.json({ ok: true });
  }

  const source = await prisma.telegramSource.findUnique({
    where: { chatId },
    include: { shop: { select: { id: true, slug: true, name: true, city: true } } },
  });

  if (!source || !source.isActive) {
    return NextResponse.json({ ok: true });
  }

  try {
    // Подсказка под формат конкретного чата, если её задали в настройках
    const input = source.hintTemplate
      ? `${source.hintTemplate}\n\n---\n${text}`
      : text;

    const { parsed, warning } = await parseOrderText(input);

    if (!parsed.address) {
      await prisma.telegramSource.update({
        where: { id: source.id },
        data: { lastMessageAt: new Date(), lastError: "В сообщении не найден адрес" },
      });
      await reply(chatId, "⚠️ Не нашёл адрес в сообщении — заказ не создан.", msg.message_id);
      return NextResponse.json({ ok: true });
    }

    const externalId = parsed.externalId || String(Date.now()).slice(-6);
    // Ключ составной: номера уникальны внутри магазина, а не глобально
    const crmId = `TG-${source.shop.slug}-${externalId}`;

    const exists = await prisma.order.findUnique({ where: { crmId } });
    if (exists) {
      await reply(chatId, `Заказ ${externalId} уже создан.`, msg.message_id);
      return NextResponse.json({ ok: true });
    }

    const geo = await geocodeAddress(parsed.address);
    const slotRaw = parsed.slotFrom && parsed.slotTo
      ? `с ${parsed.slotFrom} до ${parsed.slotTo}`
      : parsed.slotFrom;

    const order = await prisma.order.create({
      data: {
        crmId,
        externalId,
        shopId: source.shopId,
        shop: source.shop.slug,
        // Пока автосоздание выключено, заказ ложится «в сборку»:
        // диспетчер проверяет разбор и переводит дальше руками
        status: source.autoCreate ? OrderStatus.NEW : OrderStatus.ASSEMBLING,
        address: parsed.address,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        geocoded: !!geo,
        isInvalid: !geo,
        invalidReason: geo ? null : "Адрес не определился при разборе из Telegram",
        costPrice: geo?.lat && geo?.lng ? calcBaseDeliveryPrice(geo.lat, geo.lng, source.shop.city) : null,
        price: parsed.price,
        name: parsed.name,
        recipientPhone: parsed.recipientPhone,
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        items: parsed.items,
        comment: parsed.comment,
        opComment: `Из Telegram${warning ? ` (${warning})` : ""}`,
        deliveryDate: parsed.deliveryDate,
        slotFrom: parsed.slotFrom,
        slotTo: parsed.slotTo,
        slotRaw,
        crmCreatedAt: new Date(),
      },
    });

    await prisma.telegramSource.update({
      where: { id: source.id },
      data: {
        lastMessageAt: new Date(),
        lastError: null,
        ordersCreated: { increment: 1 },
      },
    });

    const missing = [
      !parsed.recipientPhone && "телефон",
      !parsed.deliveryDate && "дата",
      !parsed.slotFrom && "время",
    ].filter(Boolean);

    await reply(
      chatId,
      `✅ Заказ *${externalId}* создан\n📍 ${parsed.address}` +
        (missing.length ? `\n⚠️ Не распознано: ${missing.join(", ")}` : "") +
        (!geo ? "\n⚠️ Адрес не определился на карте" : "") +
        (source.autoCreate ? "" : "\n\nСтатус «В сборке» — проверьте в кабинете."),
      msg.message_id
    );

    console.log(`[TG bot] заказ ${order.id} из чата ${chatId}`);
  } catch (e) {
    console.error("[TG bot] разбор не удался", e);
    await prisma.telegramSource.updateMany({
      where: { chatId },
      data: { lastMessageAt: new Date(), lastError: String(e).slice(0, 500) },
    });
    await reply(chatId, "⚠️ Не удалось разобрать сообщение. Заказ не создан.", msg.message_id);
  }

  return NextResponse.json({ ok: true });
}