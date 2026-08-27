// src/app/api/request/route.ts
import { NextResponse } from "next/server";
import { sendRequestAlert } from "@/lib/mailer";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

// Фоновая функция для ТГ (3 попытки, таймаут 4 секунды на каждую)
async function sendTelegramBackground(text: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  for (let attempt = 1; attempt <= 3; attempt++) {
    // Жестко обрываем соединение через 4 сек, если туннель опять завис
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: "Markdown",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        console.log(`[Request] Telegram success (attempt ${attempt})`);
        return; // Успешно отправили — выходим из цикла
      } else {
        const err = await res.text();
        console.error(`[Request] Telegram error (attempt ${attempt}):`, err);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error(`[Request] Telegram fetch failed (attempt ${attempt}):`, e.message);
    }

    // Если это не последняя попытка — ждем 2 секунды перед ретраем
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, company, phone, email, orders, time, price, couriers, collab } = body;

    const collabLabels: Record<string, string> = {
      full:         "Полный аутсорс (~200 ₽/заказ)",
      platform:     "Только платформа (20 ₽/заказ)",
      "no-couriers": "Есть логисты, нет курьеров (50 ₽/заказ)",
      "no-logistics": "Есть курьеры, нет логистов (100 ₽/заказ)",
      mixed:        "Смешанный / договорная",
    };

    const text = [
      `🆕 *Новая заявка с сайта*`,
      ``,
      `👤 *Имя:* ${name || "—"}`,
      `🏢 *Компания:* ${company || "—"}`,
      `📞 *Телефон:* ${phone || "—"}`,
      `📧 *Email:* ${email || "—"}`,
      ``,
      `📦 *Заказов в день:* ${orders || "—"}`,
      `🕐 *Время доставок:* ${time || "—"}`,
      `💰 *Стоимость доставки:* ${price || "—"}`,
      `🚴 *Своих курьеров:* ${couriers || "0"}`,
      ``,
      `🤝 *Тип сотрудничества:*`,
      `${collabLabels[collab] || collab || "—"}`,
    ].join("\n");

    // 1. Всегда отправляем на почту СИНХРОННО (как гарант)
    let emailSuccess = false;
    try {
      const cleanText = text.replace(/[*]/g, ""); 
      await sendRequestAlert(cleanText);
      emailSuccess = true;
    } catch (e) {
      console.error("[Request] Email error:", e);
    }

    // Если почта упала, отдаем 500. 
    // Мы больше не ждем ТГ, поэтому ориентируемся на статус почты.
    if (!emailSuccess) {
      return NextResponse.json({ error: "Не удалось отправить заявку на email" }, { status: 500 });
    }

    // 2. Пускаем Telegram в ФОН (обрати внимание, здесь НЕТ await)
    // Запрос моментально проскакивает дальше, а функция пытается отправить ТГ-уведомление сама по себе
    sendTelegramBackground(text).catch(console.error);

    // 3. Возвращаем 200 OK мгновенно
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[Request] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}