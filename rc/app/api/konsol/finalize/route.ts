// src/app/api/konsol/finalize/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { addKonsolDuty, acceptKonsolTask, finalizeKonsolTask, signKonsolAct, createKonsolTask } from "@/lib/konsol";

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

    for (const [cIdStr, dates] of Object.entries(grouped)) {
      const courierId = Number(cIdStr);

      const orders = await prisma.order.findMany({
        where: { courierId, status: "DELIVERED", deliveryDate: { in: dates } }
      });

      const dutyGroups: Record<number, number> = {};
      let deliveriesTotal = 0;

      for (const o of orders) {
        const orderPrice = o.price || 0;
        if (orderPrice > 0) {
          const finalPrice = Math.round(orderPrice * 1.06);
          dutyGroups[finalPrice] = (dutyGroups[finalPrice] || 0) + 1;
          deliveriesTotal += finalPrice;
        }
      }

      if (deliveriesTotal === 0) continue;

      const courier = await prisma.courier.findUnique({ where: { id: courierId } });
      if (!courier || !courier.konsolContractorId) continue;

      // Берем последний ДРАФТ курьера или создаем новый, если его нет
      let task = await prisma.konsolTask.findFirst({
        where: { courierId, status: "DRAFT" },
        orderBy: { date: "desc" }
      });

      if (!task) {
        const sortedDates = [...dates].sort();
        const startStr = sortedDates[0].split("-").reverse().join("."); 
        const endStr = sortedDates[sortedDates.length - 1].split("-").reverse().join(".");
        
        const baseAmount = Math.round(500 * 1.06); 
        const taskId = await createKonsolTask(courier.konsolContractorId, baseAmount, startStr, endStr);
        if (!taskId) continue;
        
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

      // Добавляем услуги
      for (const [priceStr, qty] of Object.entries(dutyGroups)) {
         await addKonsolDuty(task.konsolTaskId, `Услуги доставки`, Number(priceStr), qty);
      }

      // Финализируем
      await acceptKonsolTask(task.konsolTaskId);
      const actId = await finalizeKonsolTask(task.konsolTaskId);

      if (actId) {
        await signKonsolAct(actId);
        const newTotal = task.amount + deliveriesTotal;
        
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { amount: newTotal, konsolActId: String(actId), status: "SIGNED_BY_US" }
        });

        // 🔥 Записываем оплату в нашу локальную БД, чтобы дни стали зелеными (ОПЛАЧЕН)
        for (const d of dates) {
          const existing = await prisma.courierPayment.findUnique({
            where: { courierId_date: { courierId, date: d } }
          });
          if (!existing) {
            await prisma.courierPayment.create({ data: { courierId, date: d } });
          }
        }

        successCount++;

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
      }
    }

    return NextResponse.json({ success: true, processed: successCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}