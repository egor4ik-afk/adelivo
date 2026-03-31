// src/app/api/konsol/finalize/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { acceptKonsolTask, finalizeKonsolTask, getKonsolTask } from "@/lib/konsol";

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
        // 🔥 Добавили ACCEPTED в поиск, чтобы можно было "дожать" создание акта,
        // если в прошлый раз задание принялось, но акт отвалился.
        const task = await prisma.konsolTask.findFirst({
          where: { courierId, status: { in: ["DRAFT", "CONFIRMED", "ACCEPTED"] } },
          orderBy: { id: "desc" }
        });

        // Пропускаем, если задания нет или Акт уже сформирован НАМИ
        if (!task || task.konsolActId) continue; 

        // 1. Принимаем задание (переводим в статус ACCEPTED / Выполнено)
        try {
          await acceptKonsolTask(task.konsolTaskId);
        } catch (e) {
          console.log(`Задание ${task.konsolTaskId} уже было принято (это нормально).`);
        }

        // 2. Пробуем Финализировать (создать сам Акт)
        let actId: string | null = null;
        try {
          actId = await finalizeKonsolTask(task.konsolTaskId);
        } catch (e: any) {
          console.log(`⚠️ Не удалось финализировать стандартным путем. Проверяем статус задания ${task.konsolTaskId}...`);
          
          const remoteTask = await getKonsolTask(task.konsolTaskId);
          const remoteData = remoteTask?.data || remoteTask;
          
          if (remoteData?.act_id) {
            console.log(`✅ Нашли существующий Акт ${remoteData.act_id} для задания ${task.konsolTaskId}`);
            actId = String(remoteData.act_id);
          } else {
             console.error(`❌ Акт для ${task.konsolTaskId} не создался в Консоли.`);
          }
        }

        // 3. Сохраняем в базу
        // 🔥 СОХРАНЯЕМ В БД СТАТУС ACCEPTED В ЛЮБОМ СЛУЧАЕ, 
        // чтобы заблокировать пересчет услуг (т.к. задание уже Выполнено)
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { 
            status: "ACCEPTED", 
            ...(actId ? { konsolActId: String(actId) } : {}) 
          }
        });

        if (actId) {
          successCount++;
        } else {
          // Если мы перевели в ACCEPTED, но акт почему-то не отдался, запишем в ошибки,
          // чтобы вы видели, что нужно нажать "Финализировать" еще раз для создания акта
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