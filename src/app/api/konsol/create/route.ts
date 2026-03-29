// src/app/api/konsol/create/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createKonsolTask, getKonsolTask } from "@/lib/konsol";

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payments } = await req.json();
    if (!payments || payments.length === 0) {
      return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });
    }

    const grouped: Record<number, string[]> = {};
    for (const p of payments) {
      if (!grouped[p.courierId]) grouped[p.courierId] = [];
      grouped[p.courierId].push(p.date);
    }

    let successCount = 0;
    let skipCount = 0;

    const now = new Date();
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek + 1);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const ddStart = String(now.getDate()).padStart(2, '0');
    const mmStart = String(now.getMonth() + 1).padStart(2, '0');
    const yyyyStart = now.getFullYear();
    const todayStr = `${ddStart}.${mmStart}.${yyyyStart}`;

    const ddEnd = String(sunday.getDate()).padStart(2, '0');
    const mmEnd = String(sunday.getMonth() + 1).padStart(2, '0');
    const yyyyEnd = sunday.getFullYear();
    const endOfWeekStr = `${ddEnd}.${mmEnd}.${yyyyEnd}`;

    for (const [cIdStr, dates] of Object.entries(grouped)) {
      const courierId = Number(cIdStr);
      const courier = await prisma.courier.findUnique({ where: { id: courierId } });
      
      if (!courier || !courier.konsolContractorId) continue;

      const sortedDates = [...dates].sort();
      const startDate = new Date(sortedDates[0]);

      // 🔥 Ищем все задания за неделю
      const existingTasks = await prisma.konsolTask.findMany({
        where: { 
          courierId, 
          status: { in: ["DRAFT", "CONFIRMED"] },
          date: { gte: monday, lte: sunday }
        },
        orderBy: { id: "desc" }
      });

      let hasActiveTask = false;

      // 🔥 Проверяем фактический статус заданий в Консоли
      for (const task of existingTasks) {
        // Если уже есть ID акта в базе, значит задание точно закрыто
        if (task.konsolActId) continue;

        const remoteTask = await getKonsolTask(task.konsolTaskId);
        if (remoteTask?.state?.code) {
          const code = remoteTask.state.code;
          // Если статус НЕ является финальным, значит в него еще можно добавлять услуги
          if (!["accepted", "declined", "rejected", "revoked"].includes(code)) {
            hasActiveTask = true;
            break; 
          }
        }
      }

      // Если активных редактируемых заданий нет — создаем новое!
      if (!hasActiveTask) {
        const baseAmount = 530; 
        
        const taskId = await createKonsolTask(courier.konsolContractorId, baseAmount, todayStr, endOfWeekStr);
        
        if (taskId) {
          await prisma.konsolTask.create({
            data: {
              courierId,
              konsolTaskId: String(taskId),
              date: startDate, 
              amount: baseAmount,
              status: "DRAFT"
            }
          });
          successCount++;
        }
      } else {
        skipCount++;
      }
    }

    return NextResponse.json({ success: true, processed: successCount, skipped: skipCount });
  } catch (error: any) {
    console.error("Сбой в api/konsol/create:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}