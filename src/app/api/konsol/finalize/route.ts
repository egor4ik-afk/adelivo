// src/app/api/konsol/finalize/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { updateKonsolTask, acceptKonsolTask, finalizeKonsolTask, signKonsolAct, createKonsolTask, autopayKonsolAct } from "@/lib/konsol";

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
    let errorCount = 0;

    // 🔥 Генерируем даты для Консоли (Сегодня -> Конец недели) в формате ДД.ММ.ГГГГ
    const today = new Date();
    const ddStart = String(today.getDate()).padStart(2, '0');
    const mmStart = String(today.getMonth() + 1).padStart(2, '0');
    const yyyyStart = today.getFullYear();
    const todayStr = `${ddStart}.${mmStart}.${yyyyStart}`;

    const endOfWeek = new Date(today);
    const dayOfWeek = today.getDay(); 
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    endOfWeek.setDate(today.getDate() + daysUntilSunday);
    
    const ddEnd = String(endOfWeek.getDate()).padStart(2, '0');
    const mmEnd = String(endOfWeek.getMonth() + 1).padStart(2, '0');
    const yyyyEnd = endOfWeek.getFullYear();
    const endOfWeekStr = `${ddEnd}.${mmEnd}.${yyyyEnd}`;

    for (const [cIdStr, dates] of Object.entries(grouped)) {
      const courierId = Number(cIdStr);

      // Изолируем каждого курьера в try-catch
      try {
        const orders = await prisma.order.findMany({
          where: { courierId, status: "DELIVERED", deliveryDate: { in: dates } }
        });

        // Считаем сумму всех доставок (+ налог 6%)
        let deliveriesTotal = 0;
        for (const o of orders) {
          const orderPrice = o.price || 0;
          if (orderPrice > 0) {
            deliveriesTotal += Math.round(orderPrice * 1.06);
          }
        }

        const courier = await prisma.courier.findUnique({ where: { id: courierId } });
        if (!courier || !courier.konsolContractorId) continue;

        // Ищем открытое задание: в идеале CONFIRMED (принято курьером), но захватим и DRAFT
        let task = await prisma.konsolTask.findFirst({
          where: { courierId, status: { in: ["CONFIRMED", "DRAFT"] } },
          orderBy: { date: "desc" }
        });

        // Если задания вообще нет - создаем новое
        if (!task) {
          const baseAmount = 500; 
          console.log(`[MANUAL_FINALIZE] Создаю новое задание для курьера ${courierId}...`);
          const taskId = await createKonsolTask(courier.konsolContractorId, baseAmount, todayStr, endOfWeekStr);
          
          if (!taskId) {
            console.log(`❌ Ошибка: Не удалось создать задание для ${courierId}`);
            errorCount++;
            continue;
          }
          
          const sortedDates = [...dates].sort();
          task = await prisma.konsolTask.create({
            data: {
              courierId,
              konsolTaskId: String(taskId),
              date: new Date(sortedDates[0]),
              amount: baseAmount,
              status: "DRAFT"
            }
          });
        }

        const newTotal = deliveriesTotal > 0 ? deliveriesTotal : task.amount;
        // 1. Обновляем итоговую цену и сдвигаем даты на текущие
        console.log(`[MANUAL_FINALIZE] 1. Обновляю задание ${task.konsolTaskId} (Сумма: ${newTotal})`);
        await updateKonsolTask(task.konsolTaskId, newTotal);

        // 2. Финализируем
        console.log(`[MANUAL_FINALIZE] 2. Завершаю задание...`);
        await acceptKonsolTask(task.konsolTaskId);
        
        console.log(`[MANUAL_FINALIZE] 3. Формирую акт...`);
        const actId = await finalizeKonsolTask(task.konsolTaskId);

        if (actId) {
          console.log(`[MANUAL_FINALIZE] 4. Подписываю акт (${actId})...`);
          await signKonsolAct(actId);
          await autopayKonsolAct(actId); // 🔥 Ставим в очередь на автооплату!
          
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { amount: newTotal, konsolActId: String(actId), status: "SIGNED_BY_US" }
          });

          // Записываем оплату в нашу локальную БД (зеленые дни в интерфейсе)
          for (const d of dates) {
            const existing = await prisma.courierPayment.findUnique({
              where: { courierId_date: { courierId, date: d } }
            });
            if (!existing) {
              await prisma.courierPayment.create({ data: { courierId, date: d } });
            }
          }

          successCount++;
          console.log(`✅ [MANUAL_FINALIZE] Курьер ${courierId} успешно финализирован!`);

          const user = await prisma.user.findFirst({ where: { email: courier.email || "" } });
          if (user) {
            notify({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: "custom" as any,
              userId: user.id,
              title: "💰 Акт сформирован!",
              body: `Вам начислено ${newTotal} ₽. Проверьте и подпишите акт в приложении Консоль.Про.`,
              url: "https://konsol.pro/"
            }).catch(() => {});
          }
        } else {
          console.log(`❌ [MANUAL_FINALIZE] Консоль не вернула actId для ${task.konsolTaskId}`);
          errorCount++;
        }

      } catch (err: any) {
        console.error(`❌ [MANUAL_FINALIZE] Ошибка по курьеру ${courierId}:`, err.message || err);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, processed: successCount, errors: errorCount });
  } catch (error: any) {
    console.error("[MANUAL_FINALIZE] Глобальная ошибка:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}