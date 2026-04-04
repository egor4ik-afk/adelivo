import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Функция парсинга времени (как мы делали)
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

  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChat = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!tgToken || !tgChat) {
    return NextResponse.json({ error: "No TG credentials" });
  }

  try {
    // Берем все активные заказы на сегодня, по которым еще не было алерта
    const activeOrders = await prisma.order.findMany({
      where: {
        status: { in: ["ASSIGNED", "IN_DELIVERY"] },
        delayNotified: false,
        slotTo: { not: null }
      }
    });

    let notifiedCount = 0;

    // Текущее время в минутах (МСК)
    const mskDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
    const currentMins = mskDate.getHours() * 60 + mskDate.getMinutes();

    for (const order of activeOrders) {
      const planMins = parseTimeStr(order.slotTo);
      if (planMins === null) continue;

      const etaMins = parseTimeStr(order.eta);
      
      // Опоздание считается если: 
      // Либо расчетное ETA > slotTo на 30 мин
      // Либо просто текущее время > slotTo на 30 мин (курьер тупит и ничего не жмет)
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

        // Отправляем в ТГ
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: "Markdown" }),
        });

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