// src/app/api/cron/konsol/weekly/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { updateKonsolTask, acceptKonsolTask, finalizeKonsolTask } from "@/lib/konsol";

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

    // Ищем черновики и принятые задания за неделю
    const tasks = await prisma.konsolTask.findMany({
      where: { date: { gte: monday, lte: sunday }, status: { in: ["DRAFT", "CONFIRMED"] } },
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

        // 🔥 Справочник шаблонов
        const TEMPLATES: Record<number, number> = { 500: 89135, 900: 89952, 1300: 89953 };
        let deliveriesTotal = 0;
        const dutiesMap: Record<number, number> = {};

        // Группируем
        for (const o of weeklyOrders) {
          if (o.price && o.price > 0) {
            dutiesMap[o.price] = (dutiesMap[o.price] || 0) + 1;
            deliveriesTotal += Math.round(o.price * 1.06);
          }
        }

        const newDuties = [];
        if (Object.keys(dutiesMap).length === 0) {
          newDuties.push({ template_id: 89135, price: 530, quantity: 1 });
          deliveriesTotal = 530;
        } else {
          for (const [basePriceStr, qty] of Object.entries(dutiesMap)) {
            const basePrice = Number(basePriceStr);
            newDuties.push({
              template_id: TEMPLATES[basePrice] || 89135,
              price: Math.round(basePrice * 1.06),
              quantity: qty
            });
          }
        }

        // 1. Обновляем услуги в Консоли (массивом с шаблонами)
        console.log(`[FINALIZE] 1. Обновляем задание ${task.konsolTaskId}...`);
        await updateKonsolTask(task.konsolTaskId, newDuties);

        // 2. Переводим в "Выполнено"
        console.log(`[FINALIZE] 2. Завершаем задание...`);
        try { await acceptKonsolTask(task.konsolTaskId); } catch(e) {}

        // 3. Формируем Акт
        console.log(`[FINALIZE] 3. Формируем Акт...`);
        const actId = await finalizeKonsolTask(task.konsolTaskId);

        if (actId) {
          /* 🔥 ОПЛАТА И ПОДПИСАНИЕ ВРЕМЕННО ОТКЛЮЧЕНЫ
          console.log(`[FINALIZE] 4. Подписываем Акт (${actId})...`);
          await signKonsolAct(actId);
          console.log(`[FINALIZE] 5. Отправляем в оплату...`);
          await autopayKonsolAct(actId);
          */

          // Сохраняем в БД как CONFIRMED (Акт создан, ждет ручной оплаты)
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { amount: deliveriesTotal, konsolActId: String(actId), status: "CONFIRMED" } 
          });

          successCount++;
          
          const user = await prisma.user.findUnique({ where: { email: task.courier.email || "" } });
          if (user) {
            notify({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: "custom" as any,
              userId: user.id,
              title: "📝 Акт сформирован!",
              body: `Вам начислено ${deliveriesTotal} ₽. Задание финализировано, ожидайте оплату.`,
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

    return NextResponse.json({ success: true, processed: successCount, errors: errorCount, total: tasks.length });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}