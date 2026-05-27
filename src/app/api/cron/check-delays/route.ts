// src/app/api/cron/check-delays/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Функция парсинга времени
function parseTimeStr(timeStr: string | null | undefined) {
  if (!timeStr || timeStr === "—") return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export async function GET(request: Request) {
  // Защита роута
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Получаем текущее время по МСК
  const mskDateStr = new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" });
  const mskDate = new Date(mskDateStr);
  const currentHour = mskDate.getHours();

  // 🔥 ОГРАНИЧЕНИЕ ПО ВРЕМЕНИ: Не работаем до 9:00 и после 23:00
  if (currentHour < 9 || currentHour >= 23) {
    return NextResponse.json({ ok: true, message: "Night time (outside 09:00-23:00 MSK), check skipped" });
  }

  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!tgToken || !tgChat) {
    return NextResponse.json({ error: "No TG credentials" });
  }

  try {
    // Берем все активные заказы
    const activeOrders = await prisma.order.findMany({
      where: {
        status: { in: ["ASSIGNED", "IN_DELIVERY"] },
        delayNotified: false,
        slotTo: { not: null }
      },
      include: {
        route: true
      }
    });

    let notifiedCount = 0;

    // Текущее время в минутах для расчетов
    const currentMins = currentHour * 60 + mskDate.getMinutes();

    // Сегодняшняя дата по МСК в формате "YYYY-MM-DD"
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

    for (const order of activeOrders) {
      let orderDate = null;
      if (order.route?.date) {
        orderDate = order.route.date;
      } else if (order.deliveryDate) {
        orderDate = new Date(order.deliveryDate).toISOString().split('T')[0];
      }

      if (orderDate && orderDate !== todayStr) {
        continue;
      }

      const planMins = parseTimeStr(order.slotTo);
      if (planMins === null) continue;

      // 🔥 ДОБАВЛЕНО: ЗАЩИТА ОТ РАННЕЙ ПАНИКИ
      // Если до конца слота доставки еще больше 60 минут — игнорируем.
      // Курьер еще может нагнать время, выехать быстрее или перестроить маршрут.
      if (planMins - currentMins > 60) {
        continue;
      }

      const etaMins = parseTimeStr(order.eta);
      
      // Опоздание считается если: 
      // Либо расчетное ETA > slotTo на 30 мин
      // Либо просто текущее время > slotTo на 30 мин (курьер ничего не жмет)
      const isEtaLate = etaMins !== null && (etaMins - planMins >= 30);
      const isTimeLate = (currentMins - planMins >= 30);

      if (isEtaLate || isTimeLate) {
        const msg = [
          `⚠️ *КРИТИЧЕСКОЕ ОПОЗДАНИЕ (>30 мин)*`,
          ``,
          `📦 *Заказ:* ${order.externalId || order.crmId}`,
          `📍 *Адрес:* ${order.address}`,
          `🎯 *План (до):* ${order.slotTo}`,
          `🕒 *Расчетное (ETA):* ${order.eta || "—"}`,
          `🏃 *Курьер:* ${order.courier || "Не назначен"}`
        ].join("\n");

        const proxyUrl = process.env.PROXY_URL;
        if (proxyUrl) {
          // 🔥 Отправляем через ПРОКСИ
          await fetch(proxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              token: tgToken,
              method: "sendMessage",
              payload: { chat_id: tgChat, text: msg, parse_mode: "Markdown" }
            }),
          });
        }

        // Ставим галочку, что уведомили
        await prisma.order.update({
          where: { id: order.id },
          data: { delayNotified: true }
        });

        notifiedCount++;
      }
    }

    return NextResponse.json({ ok: true, notified: notifiedCount });
  } catch (err) {
    console.error("[Cron check-delays]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
