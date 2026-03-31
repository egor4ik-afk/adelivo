// src/app/api/cron/konsol/daily/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createKonsolTask, getKonsolTask } from "@/lib/konsol";

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

    // Строки YYYY-MM-DD для поиска заказов в БД
    const mondayYMD = toYMD(monday);
    const sundayYMD = toYMD(sunday);

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
      // 1. Был ли назначен заказ НА ЭТОЙ НЕДЕЛЕ? (С понедельника по воскресенье)
      const workedThisWeek = await prisma.order.findFirst({
        where: { 
          courierId: courier.id, 
          deliveryDate: { gte: mondayYMD, lte: sundayYMD } 
        }
      });

      if (!workedThisWeek) continue;

      // 2. Ищем все задания на этой неделе в нашей базе
      const existingTasks = await prisma.konsolTask.findMany({
        where: { courierId: courier.id, date: { gte: monday, lte: sunday } },
        orderBy: { id: "desc" }
      });

      let hasActiveTask = false;

      // 🔥 Проверяем фактический статус заданий в Консоли
      for (const task of existingTasks) {
        if (task.konsolActId) continue;

        const remoteTask = await getKonsolTask(task.konsolTaskId);
        if (remoteTask?.state?.code) {
          const code = remoteTask.state.code;
          // Если статус НЕ является финальным (задание еще можно редактировать)
          if (!["accepted", "declined", "rejected", "revoked", "finalized"].includes(code)) {
            hasActiveTask = true;
            break;
          }
        } else if (task.status === "DRAFT" || task.status === "CONFIRMED") {
          // Если не удалось получить статус, но в БД оно открыто, считаем активным
          hasActiveTask = true;
          break;
        }
      }

      // 3. Если активного/редактируемого задания нет — создаем новое!
      if (!hasActiveTask) {
        const baseAmount = 530; 
        
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