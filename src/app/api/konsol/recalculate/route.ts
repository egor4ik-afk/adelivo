// src/app/api/konsol/recalculate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateKonsolTask, createKonsolTask } from "@/lib/konsol";

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payments } = await req.json();
    if (!payments || payments.length === 0) return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });

    // Группируем выбранные даты по курьерам
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
        // 🔥 Берем заказы ТОЛЬКО за выделенные дни
        const orders = await prisma.order.findMany({
          where: { courierId, status: "DELIVERED", deliveryDate: { in: dates } }
        });

        // 🔥 Справочник шаблонов
        const TEMPLATES: Record<number, number> = {
          500: 89135,
          600: 89135, // 👈 ИСПРАВИЛИ ЗДЕСЬ! Был 89999, ставим реальный шаблон
          900: 89952,
          1000: 89952,
          1300: 89953,
          1400: 89953 
        };

        let deliveriesTotal = 0;
        const dutiesMap: Record<number, number> = {};

        for (const o of orders) {
          if (o.price && o.price > 0) {
            dutiesMap[o.price] = (dutiesMap[o.price] || 0) + 1;
            deliveriesTotal += Math.round(o.price * 1.06);
          }
        }

        const courier = await prisma.courier.findUnique({ where: { id: courierId } });
        if (!courier || !courier.konsolContractorId) continue;

        // 🔥 ЛОГИКА ОТСЕЧЕНИЯ НОВЫХ ЗАДАНИЙ (созданных после завершения смен)
        // 1. Берем самую позднюю дату из выбранных смен
        const maxDateStr = [...dates].sort().reverse()[0]; 
        const cutoffDate = new Date(maxDateStr);
        // 2. Сдвигаем на 1 день вперед
        cutoffDate.setDate(cutoffDate.getDate() + 1);
        // 3. Устанавливаем границу в 05:00 UTC (08:00 МСК), чтобы задания, 
        // созданные утром понедельника (например в 08:15 UTC), не попали под выборку.
        cutoffDate.setUTCHours(5, 0, 0, 0);

        let task = await prisma.konsolTask.findFirst({
          where: { 
            courierId, 
            status: { in: ["DRAFT", "CONFIRMED"] },
            // 🔥 Ищем последнее задание, созданное строго ДО этой границы
            createdAt: { lt: cutoffDate }
          },
          orderBy: { id: "desc" }
        });

        // Если вдруг задания нет, создаем пустышку
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

        const newDuties = [];
        if (Object.keys(dutiesMap).length === 0) {
          newDuties.push({ template_id: 89135, price: 530, quantity: 1 });
          deliveriesTotal = 530;
        } else {
          for (const [basePriceStr, qty] of Object.entries(dutiesMap)) {
            const basePrice = Number(basePriceStr);
            const finalPrice = Math.round(basePrice * 1.06);
            const tplId = TEMPLATES[basePrice] || 89135;

            newDuties.push({
              template_id: tplId,
              price: finalPrice,
              quantity: qty
            });
          }
        }

        // 🔥 Обновляем услуги в Консоли!
        await updateKonsolTask(task.konsolTaskId, newDuties);

        // Обновляем сумму в нашей БД
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { amount: deliveriesTotal }
        });

        successCount++;
      } catch (err: any) {
        console.error(`❌ Ошибка пересчета курьера ${courierId}:`, err.message || err);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, processed: successCount, errors: errorCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}