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
    const { payments } = await req.json(); // [{courierId: 1, date: "YYYY-MM-DD"}]
    if (!payments || payments.length === 0) return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });

    // Группируем выбранные даты по курьерам
    const grouped: Record<number, string[]> = {};
    for (const p of payments) {
      if (!grouped[p.courierId]) grouped[p.courierId] = [];
      grouped[p.courierId].push(p.date);
    }

    let successCount = 0;
    let skipCount = 0;

    for (const [cIdStr, dates] of Object.entries(grouped)) {
      const courierId = Number(cIdStr);
      const courier = await prisma.courier.findUnique({ where: { id: courierId } });
      
      if (!courier || !courier.konsolContractorId) continue;

      const sortedDates = [...dates].sort();
      const startDate = new Date(sortedDates[0]);
      // Форматируем даты для названия задания в Консоли (ДД.ММ.ГГГГ)
      const startStr = sortedDates[0].split("-").reverse().join("."); 
      const endStr = sortedDates[sortedDates.length - 1].split("-").reverse().join(".");

      // Проверяем, есть ли у этого курьера уже открытое задание (Черновик)
      const existingTask = await prisma.konsolTask.findFirst({
        where: { courierId, status: "DRAFT" }
      });

      if (!existingTask) {
        const baseAmount = Math.round(500 * 1.06); // 530 руб базовая услуга с налогом
        const taskId = await createKonsolTask(courier.konsolContractorId, baseAmount, startStr, endStr);
        
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
        skipCount++; // Задание уже было создано ранее
      }
    }

    return NextResponse.json({ success: true, processed: successCount, skipped: skipCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}