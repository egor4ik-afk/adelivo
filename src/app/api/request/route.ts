// src/app/api/request/route.ts
import { NextResponse } from "next/server";
import { sendRequestAlert } from "@/lib/mailer";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID; // ID чата/группы для уведомлений

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

    let tgSuccess = false;

    // 1. Пробуем отправить в Telegram (не прерываем работу при ошибке)
    if (BOT_TOKEN && CHAT_ID) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            text,
            parse_mode: "Markdown",
          }),
        });

        if (res.ok) {
          tgSuccess = true;
        } else {
          const err = await res.text();
          console.error("[Request] Telegram error:", err);
        }
      } catch (e) {
        console.error("[Request] Telegram fetch failed:", e);
      }
    } else {
      console.error("[Request] BOT_TOKEN или CHAT_ID не настроены");
    }

    // 2. Всегда отправляем дубль на почту
    let emailSuccess = false;
    try {
      // Очищаем текст от Markdown-звездочек для красивого отображения в письме
      const cleanText = text.replace(/[*]/g, ""); 
      await sendRequestAlert(cleanText);
      emailSuccess = true;
    } catch (e) {
      console.error("[Request] Email error:", e);
    }

    // 3. Возвращаем ответ
    // Если ни Telegram, ни почта не отработали, выдаём 500 ошибку
    if (!tgSuccess && !emailSuccess) {
      return NextResponse.json({ error: "Не удалось отправить заявку ни в TG, ни на email" }, { status: 500 });
    }

    // Если хотя бы один канал связи отработал успешно, считаем заявку принятой
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[Request] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}