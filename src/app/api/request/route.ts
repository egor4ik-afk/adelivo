// src/app/api/request/route.ts
// Принимает заявку с формы и отправляет в Telegram-бот
import { NextResponse } from "next/server";

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

    if (!BOT_TOKEN || !CHAT_ID) {
      console.error("[Request] BOT_TOKEN или CHAT_ID не настроены");
      return NextResponse.json({ error: "Бот не настроен" }, { status: 500 });
    }

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Request] Telegram error:", err);
      return NextResponse.json({ error: "Ошибка отправки" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[Request] Error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}