// src/app/api/cron/konsol/weekly/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { updateKonsolTask, acceptKonsolTask, finalizeKonsolTask, signKonsolAct, autopayKonsolAct } from "@/lib/konsol";

export const dynamic = "force-dynamic";

function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
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

    const mondayStr = toYMD(monday);
    const sundayStr = toYMD(sunday);

    // Ищем только подтвержденные курьером задания
    const tasks = await prisma.konsolTask.findMany({
      where: { date: { gte: monday, lte: sunday }, status: "CONFIRMED" },
      include: { courier: true }
    });

    let successCount = 0;
    let errorCount = 0;

    for (const task of tasks) {
      if (!task.konsolTaskId) continue;

      try {
        const weeklyOrders = await prisma.order.findMany({
          where: { 
            courierId: task.courier.id, 
            status: "DELIVERED", 
            deliveryDate: { gte: mondayStr, lte: sundayStr } 
          }
        });

        // Считаем сумму всех доставок за неделю
        let deliveriesTotal = 0;
        for (const o of weeklyOrders) {
          if (o.price && o.price > 0) {
            deliveriesTotal += Math.round(o.price * 1.06); 
          }
        }

        // 🔥 Итоговая сумма: базовая ставка (500) + все доставки
        const newTotalAmount = deliveriesTotal > 0 ? deliveriesTotal : task.amount;
        // 1. ЗАМЕНЯЕМ начальную цену в Консоли на итоговую!
        console.log(`[FINALIZE] 1. Обновляем задание ${task.konsolTaskId} на сумму: ${newTotalAmount} ₽...`);
        await updateKonsolTask(task.konsolTaskId, newTotalAmount);

        // 2. Принимаем задание
        console.log(`[FINALIZE] 2. Завершаем задание...`);
        await acceptKonsolTask(task.konsolTaskId);

        // 3. Формируем Акт
        console.log(`[FINALIZE] 3. Формируем Акт...`);
        const actId = await finalizeKonsolTask(task.konsolTaskId);

        if (actId) {
          // 4. Подписываем Акт
          console.log(`[FINALIZE] 4. Подписываем Акт (${actId})...`);
          await signKonsolAct(actId);
          
          console.log(`[FINALIZE] 5. Отправляем в оплату...`);
          await autopayKonsolAct(actId);

          // Сохраняем новую общую сумму в нашу БД
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { amount: newTotalAmount, konsolActId: String(actId), status: "SIGNED_BY_US" }
          });

          successCount++;
          
          const user = await prisma.user.findUnique({ where: { email: task.courier.email || "" } });
          if (user) {
            notify({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: "custom" as any,
              userId: user.id,
              title: "💰 Акт сформирован!",
              body: `Вам начислено ${newTotalAmount} ₽. Проверьте и подпишите акт в приложении Консоль.Про.`,
              url: "https://konsol.pro/"
            }).catch(console.error);
          }
        } else {
          errorCount++;
        }

      } catch (taskError: any) {
        console.error(`❌ [FINALIZE] Ошибка при обработке задания ${task.konsolTaskId}:`, taskError.message || taskError);
        errorCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: successCount, 
      errors: errorCount, 
      total: tasks.length 
    });

  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}