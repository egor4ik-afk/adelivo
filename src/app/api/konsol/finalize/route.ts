// src/app/api/konsol/finalize/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateKonsolTask, acceptKonsolTask, createKonsolTask, finalizeKonsolTask } from "@/lib/konsol";

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payments } = await req.json();
    if (!payments || payments.length === 0) return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });

    const grouped: Record<number, string[]> = {};
    for (const p of payments) {
      if (!grouped[p.courierId]) grouped[p.courierId] = [];
      grouped[p.courierId].push(p.date);
    }

    let successCount = 0;
    let errorCount = 0;

    const today = new Date();
    const ddStart = String(today.getDate()).padStart(2, '0');
    const mmStart = String(today.getMonth() + 1).padStart(2, '0');
    const yyyyStart = today.getFullYear();
    const todayStr = `${ddStart}.${mmStart}.${yyyyStart}`;

    const endOfWeek = new Date(today);
    const dayOfWeek = today.getDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    endOfWeek.setDate(today.getDate() + daysUntilSunday);
    const endOfWeekStr = `${String(endOfWeek.getDate()).padStart(2, '0')}.${String(endOfWeek.getMonth() + 1).padStart(2, '0')}.${endOfWeek.getFullYear()}`;

    for (const [cIdStr, dates] of Object.entries(grouped)) {
      const courierId = Number(cIdStr);

      try {
        const orders = await prisma.order.findMany({
          where: { courierId, status: "DELIVERED", deliveryDate: { in: dates } }
        });

        // 🔥 Справочник твоих шаблонов (Базовая цена заказа -> ID шаблона)
        const TEMPLATES: Record<number, number> = {
          500: 89135,
          900: 89952,
          1300: 89953
        };

        let deliveriesTotal = 0;
        const dutiesMap: Record<number, number> = {};

        // Группируем заказы по базовой цене
        for (const o of orders) {
          if (o.price && o.price > 0) {
            dutiesMap[o.price] = (dutiesMap[o.price] || 0) + 1;
            deliveriesTotal += Math.round(o.price * 1.06);
          }
        }

        const courier = await prisma.courier.findUnique({ where: { id: courierId } });
        if (!courier || !courier.konsolContractorId) continue;

        let task = await prisma.konsolTask.findFirst({
          where: { courierId, status: { in: ["DRAFT", "CONFIRMED"] } },
          orderBy: { date: "desc" }
        });

        if (!task) {
          const baseAmount = 530; 
          const taskId = await createKonsolTask(courier.konsolContractorId, baseAmount, todayStr, endOfWeekStr);
          if (!taskId) continue;

          task = await prisma.konsolTask.create({
            data: {
              courierId,
              konsolTaskId: String(taskId),
              date: new Date(dates[0]),
              amount: baseAmount,
              status: "DRAFT"
            }
          });
        }

        // 🔥 Формируем массив услуг для Консоли
        const newDuties = [];
        if (Object.keys(dutiesMap).length === 0) {
          // Если заказов вдруг 0, ставим дефолтную 1 доставку
          newDuties.push({ template_id: 89135, price: 530, quantity: 1 });
          deliveriesTotal = 530;
        } else {
          for (const [basePriceStr, qty] of Object.entries(dutiesMap)) {
            const basePrice = Number(basePriceStr);
            const finalPrice = Math.round(basePrice * 1.06); // Накидываем налог 6%
            const tplId = TEMPLATES[basePrice] || 89135;     // Если цена неизвестная, берем базовый шаблон

            newDuties.push({
              template_id: tplId,
              price: finalPrice,
              quantity: qty
            });
          }
        }

        // 1. Обновляем услуги в задании Консоли
        await updateKonsolTask(task.konsolTaskId, newDuties);

        // 2. Переводим в "Выполнено"
        try {
          await acceptKonsolTask(task.konsolTaskId);
        } catch (e) {
          console.log(`Задание ${task.konsolTaskId} уже было принято.`);
        }

        // 3. Формируем Акт
        const actId = await finalizeKonsolTask(task.konsolTaskId);

        if (actId) {
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { amount: deliveriesTotal, konsolActId: String(actId), status: "CONFIRMED" }
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