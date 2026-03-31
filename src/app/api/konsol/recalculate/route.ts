// src/app/api/konsol/recalculate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateKonsolTask } from "@/lib/konsol";

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

        // 🔥 Ищем открытое задание (DRAFT или CONFIRMED без акта)
        // Чтобы не было дублей, берем самое последнее
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
          continue; // БЕЗ СОЗДАНИЯ НОВЫХ ЗАДАНИЙ!
        }

        // Подсчет доставок
        const dutiesMap: Record<number, number> = {};
        
        // Берем заказы ТОЛЬКО за выделенные дни
        const orders = await prisma.order.findMany({
          where: { courierId, status: "DELIVERED", deliveryDate: { in: dates } }
        });

        for (const o of orders) {
          if (o.price && o.price > 0) {
            dutiesMap[o.price] = (dutiesMap[o.price] || 0) + 1;
          }
        }

        // Применяем ручные изменения (overrides)
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
          // Если вообще нет услуг, ставим 1 базовую, чтобы Консоль не ругалась (цена 636 = 600 * 1.06)
          newDuties.push({ template_id: 89135, price: 636, quantity: 1 });
          deliveriesTotal = 636;
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