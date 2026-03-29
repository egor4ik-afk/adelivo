// src/app/api/cron/konsol/daily/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createKonsolTask } from "@/lib/konsol";

export const dynamic = "force-dynamic";

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

    const todayYMD = toYMD(today);

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
      // 1. Был ли назначен хоть один заказ на курьера СЕГОДНЯ?
      // 🔥 СТАТУС БОЛЬШЕ НЕ ВАЖЕН! Убрали status: "DELIVERED"
      const workedToday = await prisma.order.findFirst({
        where: { 
          courierId: courier.id, 
          deliveryDate: todayYMD 
        }
      });

      if (!workedToday) continue;

      // 2. Ищем, есть ли уже открытое задание на ЭТОЙ НЕДЕЛЕ (с ПН по ВС)
      const existingTask = await prisma.konsolTask.findFirst({
        where: { courierId: courier.id, date: { gte: monday, lte: sunday } }
      });

      // 3. Если задания нет — создаем новое!
      if (!existingTask) {
        const baseAmount = 530; // Базовая ставка с учетом налога
        
        console.log(`[Daily Cron] Создаю задание для курьера ${courier.id}...`);
        
        const taskId = await createKonsolTask(courier.konsolContractorId!, baseAmount, todayKonsolStr, sundayKonsolStr);
        
        if (taskId) {
          await prisma.konsolTask.create({
            data: {
              courierId: courier.id,
              konsolTaskId: String(taskId),
              date: today,
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