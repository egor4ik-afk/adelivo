// src/app/api/cron/konsol/daily/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createKonsolTask } from "@/lib/konsol";

// Помощник для перевода Date в строку YYYY-MM-DD
function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // 🔥 Строки для фильтрации таблицы Order (YYYY-MM-DD)
    const mondayStr = toYMD(monday);
    const sundayStr = toYMD(sunday);

    // Строки для названия задания в Консоли (ДД.ММ.ГГГГ)
    const dateStartStr = monday.toLocaleDateString("ru-RU");
    const dateEndStr = sunday.toLocaleDateString("ru-RU");

    const couriers = await prisma.courier.findMany({
      where: { konsolContractorId: { not: null }, isActive: true }
    });

    for (const courier of couriers) {
      // Был ли хоть один заказ сегодня/на неделе?
      const workedThisWeek = await prisma.order.findFirst({
        where: { 
          courierId: courier.id, 
          status: "DELIVERED", 
          deliveryDate: { gte: mondayStr, lte: sundayStr } // 🔥 Используем YYYY-MM-DD
        }
      });

      if (!workedThisWeek) continue;

      // Ищем в KonsolTask (тут date имеет тип DateTime, поэтому оставляем объекты Date)
      const existingTask = await prisma.konsolTask.findFirst({
        where: { courierId: courier.id, date: { gte: monday, lte: sunday } }
      });

      if (!existingTask) {
        const baseAmount = Math.round(500 * 1.06); // 530 руб базовая услуга с налогом
        const taskId = await createKonsolTask(courier.konsolContractorId!, baseAmount, dateStartStr, dateEndStr);
        
        if (taskId) {
          await prisma.konsolTask.create({
            data: {
              courierId: courier.id,
              konsolTaskId: String(taskId),
              date: monday, // В базу пишем объект Date
              amount: baseAmount,
              status: "DRAFT"
            }
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}