// src/app/api/cron/konsol/daily/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createKonsolTask } from "@/lib/konsol";

export const dynamic = "force-dynamic";

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
    
    // Высчитываем понедельник и воскресенье для поиска в нашей БД
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Строка на СЕГОДНЯ для проверки заказов (YYYY-MM-DD)
    const todayYMD = toYMD(today);

    // 🔥 Строки для Консоли (ДД.ММ.ГГГГ)
    // В Консоль ВСЕГДА отправляем стартовой датой СЕГОДНЯ, чтобы не было ошибки дат
    const ddToday = String(today.getDate()).padStart(2, '0');
    const mmToday = String(today.getMonth() + 1).padStart(2, '0');
    const yyyyToday = today.getFullYear();
    const todayKonsolStr = `${ddToday}.${mmToday}.${yyyyToday}`;

    const ddSun = String(sunday.getDate()).padStart(2, '0');
    const mmSun = String(sunday.getMonth() + 1).padStart(2, '0');
    const yyyySun = sunday.getFullYear();
    const sundayKonsolStr = `${ddSun}.${mmSun}.${yyyySun}`;

    const couriers = await prisma.courier.findMany({
      where: { konsolContractorId: { not: null }, isActive: true }
    });

    let createdCount = 0;

    for (const courier of couriers) {
      // 1. Был ли хоть один доставленный заказ СЕГОДНЯ?
      const workedToday = await prisma.order.findFirst({
        where: { 
          courierId: courier.id, 
          status: "DELIVERED", 
          deliveryDate: todayYMD // Ищем заказы конкретно за сегодня
        }
      });

      if (!workedToday) continue;

      // 2. Ищем, есть ли уже открытое задание на ЭТОЙ НЕДЕЛЕ (с ПН по ВС)
      const existingTask = await prisma.konsolTask.findFirst({
        where: { courierId: courier.id, date: { gte: monday, lte: sunday } }
      });

      // 3. Если задания нет — создаем новое!
      if (!existingTask) {
        const baseAmount = 500; // Базовая ставка (без налога, как мы решили)
        
        console.log(`[Daily Cron] Создаю задание для курьера ${courier.id}...`);
        
        // Создаем с СЕГОДНЯ по ВОСКРЕСЕНЬЕ
        const taskId = await createKonsolTask(courier.konsolContractorId!, baseAmount, todayKonsolStr, sundayKonsolStr);
        
        if (taskId) {
          await prisma.konsolTask.create({
            data: {
              courierId: courier.id,
              konsolTaskId: String(taskId),
              date: today, // В базу пишем сегодняшнюю дату
              amount: baseAmount,
              status: "DRAFT"
            }
          });
          createdCount++;
          console.log(`✅ [Daily Cron] Задание ${taskId} для курьера ${courier.id} успешно создано.`);
        }
      }
    }

    return NextResponse.json({ success: true, created: createdCount });
  } catch (error: any) {
    console.error("[Daily Cron Error]:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}