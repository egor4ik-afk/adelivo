// src/app/api/webhooks/telegram/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOURCE_CHAT_ID = process.env.TELEGRAM_SOURCE_CHAT_ID;
const ADMIN_CHAT_ID = process.env.TELEGRAM_SPAM_ID;

async function sendNotificationToAdmin(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text }),
  });
}

function normalizePhone(rawPhone: string | null): string | null {
  if (!rawPhone) return null;

  let digits = rawPhone.replace(/\D/g, "");

  if ((digits.startsWith("7") || digits.startsWith("8")) && digits.length === 11) {
    digits = digits.slice(1);
  } else if ((digits.startsWith("77") || digits.startsWith("78")) && digits.length === 12) {
    digits = digits.slice(2);
  }

  if (digits.length === 10) {
    return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }

  return rawPhone.startsWith("+") ? rawPhone : `+${digits}`;
}

function parseOrderText(text: string) {
  const get = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() || null;

  const orderId = get(/Номер заказа:\s*#?(\S+)/i);
  const name    = get(/Имя получателя:\s*(.+)/i);
  const phone   = get(/Телефон получателя:\s*(.+)/i);
  const address = get(/Адрес:\s*(.+)/i);

  return { orderId, name, phone, address };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.message) {
      return NextResponse.json({ status: "ignored_no_message" });
    }

    const text = body.message.text || body.message.caption;
    const chatId = String(body.message.chat.id);

    console.log("\n👀 ПРИШЛО СООБЩЕНИЕ ИЗ ТЕЛЕГРАМА:");
    console.log(`👉 Chat ID: [${chatId}]`);
    console.log(`👉 Текст: ${text ? text.substring(0, 50) + "..." : "Без текста"}`);
    console.log("------------------------------------\n");

    if (!text) {
      return NextResponse.json({ status: "ignored_no_text" });
    }

    // 1. Читаем только из нужного чата
    if (SOURCE_CHAT_ID && chatId !== SOURCE_CHAT_ID) {
      console.log(`❌ Игнорируем чат [${chatId}]. Ждем только из [${SOURCE_CHAT_ID}]`);
      return NextResponse.json({ status: "ignored_wrong_chat" });
    }

    // 2. Фильтр: только сообщения с номером заказа
    if (!/Номер заказа/i.test(text)) {
      console.log("❌ Игнорируем: нет номера заказа.");
      return NextResponse.json({ status: "ignored_not_order" });
    }

    // 3. Парсим текст
    const { orderId, name, phone, address } = parseOrderText(text);
    console.log("📦 Распарсили:", { orderId, name, phone, address });

    if (!orderId && !address) {
      return NextResponse.json({ status: "not_enough_data" });
    }

    if (!phone && !name) {
      return NextResponse.json({ status: "no_contacts" });
    }

    // 4. Ищем заказ в БД
    let targetOrder = null;

    if (orderId) {
      targetOrder = await prisma.order.findFirst({
        where: {
          OR: [
            { crmId: orderId },
            { externalId: orderId },
            { crmId: `#${orderId}` },
            { externalId: `#${orderId}` },
          ],
        },
      });
    }

    // Fallback по адресу если не нашли по id
    if (!targetOrder && address) {
      const shortAddress = address.substring(0, 15).trim();
      targetOrder = await prisma.order.findFirst({
        where: {
          status: { in: ["NEW", "ASSIGNED"] },
          address: { contains: shortAddress, mode: "insensitive" },
        },
      });
    }

    if (!targetOrder) {
      console.log("⚠️ Заказ не найден в базе.");
      await sendNotificationToAdmin(
        `⚠️ Пришел контакт для заказа, но я не нашел его в базе.\nИскал по: ${orderId ? `#${orderId}` : `адресу "${address?.substring(0, 20)}..."`}`
      );
      return NextResponse.json({ status: "order_not_found" });
    }

    // 5. Обновляем только имя и телефон получателя
    const formattedPhone = normalizePhone(phone);
    console.log(`💾 Обновляем [${targetOrder.crmId}] -> Имя: ${name}, Тел: ${formattedPhone}`);

    await prisma.order.update({
      where: { id: targetOrder.id },
      data: {
        recipientPhone: formattedPhone || targetOrder.recipientPhone,
        name: name || targetOrder.name,
      },
    });

    // 6. Отчет админу
    const foundByText = orderId ? `#${orderId}` : `(найден по адресу)`;
    await sendNotificationToAdmin(
      `✅ Обновлен заказ ${foundByText}\n👤 Имя: ${name || "—"}\n📞 Тел: ${formattedPhone || "—"}\n📍 Адрес: ${targetOrder.address}`
    );

    console.log("🎉 Успешно!");
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Ошибка Telegram Webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}