// src/app/api/routes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();

    // 1. Получаем старый маршрут вместе с данными курьера (для уведомления)
    const oldRoute = await prisma.route.findUnique({
      where: { id },
      include: { courier: true }
    });

    if (!oldRoute) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // 2. Обновляем данные маршрута в БД
    const updatedRoute = await prisma.route.update({
      where: { id },
      data: { baseArrivalTime: body.baseArrivalTime }
    });

    // 3. Отправляем уведомление в Telegram, если время действительно поменялось
    if (body.baseArrivalTime && oldRoute.baseArrivalTime !== body.baseArrivalTime) {
      const tgToken = process.env.TELEGRAM_BOT_TOKEN;
      const tgChat  = process.env.TELEGRAM_ADMIN_CHAT_ID;
      
      if (tgToken && tgChat) {
        const msg = [
          `🏠 *Изменено время прибытия на базу*`,
          ``,
          `👤 *Курьер:* ${oldRoute.courier?.fullName || "Неизвестен"}`,
          `🛣 *Маршрут:* ${oldRoute.name || "Без названия"}`,
          `🕒 *Новое время:* ${body.baseArrivalTime}`
        ].join("\n");

        fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: "Markdown" }),
        }).catch(e => console.error("[TG] Ошибка уведомления (база):", e));
      }
    }

    // 💡 Здесь в будущем можно вызывать функцию полного перерасчета маршрута (Яндекс), 
    // так как стартовое время изменилось!

    return NextResponse.json(updatedRoute);
  } catch (error) {
    console.error("PATCH /api/routes/[id] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}