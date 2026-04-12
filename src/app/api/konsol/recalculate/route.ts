// src/app/api/konsol/recalculate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateKonsolTask, getKonsolTask } from "@/lib/konsol"; // 🔥 Добавили getKonsolTask

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payments, overrides } = await req.json();
    if (!payments || payments.length === 0) return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });

    const grouped: Record<number, string[]> = {};
    for (const p of payments) {
      if (!grouped[p.courierId]) grouped[p.courierId] = [];
      grouped[p.courierId].push(p.date);
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const [cIdStr, dates] of Object.entries(grouped)) {
      const courierId = Number(cIdStr);

      try {
        const courier = await prisma.courier.findUnique({ where: { id: courierId } });
        if (!courier || !courier.konsolContractorId) continue;

        const task = await prisma.konsolTask.findFirst({
          where: { 
            courierId, 
            status: { in: ["DRAFT", "CONFIRMED"] },
            konsolActId: null
          },
          orderBy: { id: "desc" }
        });

        if (!task) {
          console.error(`❌ Нет открытого задания для курьера ${courierId}`);
          errors.push(`Нет открытого задания для ${courier.fullName}`);
          errorCount++;
          continue; 
        }

        // 🔥 ПРОВЕРЯЕМ РЕАЛЬНЫЙ СТАТУС В КОНСОЛИ ПЕРЕД РЕДАКТИРОВАНИЕМ
        const remoteTask = await getKonsolTask(task.konsolTaskId);
        if (!remoteTask) {
           throw new Error(`Задание ${task.konsolTaskId} не найдено в API Консоли.`);
        }

        const currentState = remoteTask.state?.code;
        
        // 🔥 Если статус финальный, Консоль выдаст "Нет доступа" при попытке добавить услуги
        if (['completed', 'finalized', 'cancelled', 'revoked'].includes(currentState)) {
           console.log(`[Синхронизация БД] Задание ${task.konsolTaskId} курьера ${courierId} уже закрыто (${currentState}). Обновляем БД.`);
           
           // ЛЕЧИМ НАШУ БАЗУ: помечаем как закрытое и подтягиваем ID акта (если есть)
           await prisma.konsolTask.update({
             where: { id: task.id },
             data: { 
               status: "COMPLETED",
               konsolActId: remoteTask.acts_ids?.[0] ? String(remoteTask.acts_ids[0]) : null
             }
           });
           
           errors.push(`Задание курьера ${courier.fullName} уже закрыто в Консоли (${currentState})`);
           errorCount++;
           continue; // Пропускаем пересчет, так как менять больше нельзя
        }

        // Подсчет доставок
        const dutiesMap: Record<number, number> = {};
        
        const orders = await prisma.order.findMany({
          where: { courierId, status: "DELIVERED", deliveryDate: { in: dates } }
        });

        for (const o of orders) {
          if (o.price && o.price > 0) {
            dutiesMap[o.price] = (dutiesMap[o.price] || 0) + 1;
          }
        }

        if (overrides && overrides[courierId]) {
          for (const [priceStr, qty] of Object.entries(overrides[courierId] as Record<string, number>)) {
            dutiesMap[Number(priceStr)] = qty;
          }
        }

        const TEMPLATES: Record<number, number> = {
          500: 89135,
          600: 89135,
          900: 89952,
          1000: 89952,
          1300: 89953,
          1400: 89953 
        };

        const newDuties = [];
        let deliveriesTotal = 0;

        for (const [basePriceStr, qty] of Object.entries(dutiesMap)) {
          if (qty <= 0) continue;
          const basePrice = Number(basePriceStr);
          const finalPrice = Math.round(basePrice * 1.06);
          const tplId = TEMPLATES[basePrice] || 89135;

          newDuties.push({
            template_id: tplId,
            price: finalPrice,
            quantity: qty
          });
          deliveriesTotal += finalPrice * qty;
        }

        if (newDuties.length === 0) {
          newDuties.push({ template_id: 89135, price: 636, quantity: 1 });
          deliveriesTotal = 636;
        }

        // Обновляем услуги в Консоли
        await updateKonsolTask(task.konsolTaskId, newDuties);

        // Обновляем сумму в нашей БД
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { amount: deliveriesTotal }
        });

        successCount++;
      } catch (err: any) {
        console.error(`❌ Ошибка пересчета курьера ${courierId}:`, err.message || err);
        errors.push(`Ошибка курьера ${courierId}: ${err.message}`);
        errorCount++;
      }
    }

    if (errorCount > 0) {
        return NextResponse.json({ success: successCount > 0, processed: successCount, errors: errorCount, message: errors.join('; ') });
    }

    return NextResponse.json({ success: true, processed: successCount, errors: errorCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}