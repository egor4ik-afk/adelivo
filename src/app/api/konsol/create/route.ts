// src/app/api/konsol/create/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { createKonsolTask } from "@/lib/konsol";

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

    // 🔥 Дата начала (сегодня)
    const today = new Date();
    const ddStart = String(today.getDate()).padStart(2, '0');
    const mmStart = String(today.getMonth() + 1).padStart(2, '0');
    const yyyyStart = today.getFullYear();
    const todayStr = `${ddStart}.${mmStart}.${yyyyStart}`;

    // 🔥 Дата окончания (ближайшее воскресенье)
    const endOfWeek = new Date(today);
    const dayOfWeek = today.getDay(); // 0 = Воскресенье
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    endOfWeek.setDate(today.getDate() + daysUntilSunday);
    
    const ddEnd = String(endOfWeek.getDate()).padStart(2, '0');
    const mmEnd = String(endOfWeek.getMonth() + 1).padStart(2, '0');
    const yyyyEnd = endOfWeek.getFullYear();
    const endOfWeekStr = `${ddEnd}.${mmEnd}.${yyyyEnd}`;

    for (const [cIdStr, dates] of Object.entries(grouped)) {
      const courierId = Number(cIdStr);
      const courier = await prisma.courier.findUnique({ where: { id: courierId } });
      
      if (!courier || !courier.konsolContractorId) continue;

      const sortedDates = [...dates].sort();
      const startDate = new Date(sortedDates[0]);

      const existingTask = await prisma.konsolTask.findFirst({
        where: { courierId, status: "DRAFT" }
      });

      if (!existingTask) {
        const baseAmount = 530; 
        
        // Передаем старт (сегодня) и конец (воскресенье)
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