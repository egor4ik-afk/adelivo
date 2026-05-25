// src/app/api/routes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notifications"; // 🔥 ДОБАВЛЕНО: импорт уведомлений

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(); // 🔥 ВОЗВРАЩАЕМ КАК БЫЛО
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();

    const oldRoute = await prisma.route.findUnique({
      where: { id },
      include: { courier: true }
    });

    if (!oldRoute) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    const updatedRoute = await prisma.route.update({
      where: { id },
      data: { 
        baseArrivalTime: body.baseArrivalTime,
        estimatedReturnTime: body.estimatedReturnTime 
      }
    });

    // Отправляем уведомления, если время прибытия на базу было указано впервые или изменено
    if (body.baseArrivalTime && oldRoute.baseArrivalTime !== body.baseArrivalTime) {
      
      // 🔥 1. ПУШ ОПЕРАТОРАМ: Маршрут принят, время указано
      await notify({
        type: "route.accepted",
        routeName: oldRoute.name,
        courierName: oldRoute.courier?.fullName || "Курьер",
        baseTime: body.baseArrivalTime
      }).catch(e => console.error("[PUSH] Ошибка отправки:", e));

      // 🔥 2. УВЕДОМЛЕНИЕ В TELEGRAM
      const tgToken = process.env.TELEGRAM_BOT_TOKEN;
      const tgChat  = process.env.TELEGRAM_ADMIN_CHAT_ID;
      
      if (tgToken && tgChat) {
        const msg = [
          `🏠 *Курьер принял маршрут и указал время на базе*`,
          ``,
          `👤 *Курьер:* ${oldRoute.courier?.fullName || "Неизвестен"}`,
          `🛣 *Маршрут:* ${oldRoute.name || "Без названия"}`,
          `🕒 *Время прибытия:* ${body.baseArrivalTime}`
        ].join("\n");

        fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: "Markdown" }),
        }).catch(e => console.error("[TG] Ошибка уведомления (база):", e));
      }
    }

    return NextResponse.json(updatedRoute);
  } catch (error) {
    console.error("PATCH /api/routes/[id] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}