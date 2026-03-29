// src/app/api/konsol/finalize/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { acceptKonsolTask, finalizeKonsolTask } from "@/lib/konsol";

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payments } = await req.json();
    if (!payments || payments.length === 0) return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });

    // Нам нужны только уникальные ID курьеров из выделенных чекбоксов
    const couriersIds = [...new Set(payments.map((p: any) => p.courierId))] as number[];
    let successCount = 0;
    let errorCount = 0;

    for (const courierId of couriersIds) {
      try {
        const task = await prisma.konsolTask.findFirst({
          where: { courierId, status: { in: ["DRAFT", "CONFIRMED"] } },
          orderBy: { id: "desc" }
        });

        // Пропускаем, если задания нет или Акт уже сформирован
        if (!task || task.konsolActId) continue; 

        // 1. Принимаем задание
        try {
          await acceptKonsolTask(task.konsolTaskId);
        } catch (e) {
          console.log(`Задание ${task.konsolTaskId} уже было принято.`);
        }

        // 2. Формируем Акт
        const actId = await finalizeKonsolTask(task.konsolTaskId);

        if (actId) {
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { konsolActId: String(actId), status: "CONFIRMED" }
          });
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err: any) {
        console.error(`❌ Ошибка финализации курьера ${courierId}:`, err.message || err);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, processed: successCount, errors: errorCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}