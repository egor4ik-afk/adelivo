// src/app/api/konsol/pay/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { signKonsolAct, autopayKonsolAct, acceptKonsolTask, finalizeKonsolTask } from "@/lib/konsol";

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payments } = await req.json();
    if (!payments || payments.length === 0) return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });

    const couriersIds = [...new Set(payments.map((p: any) => p.courierId))] as number[];
    let successCount = 0;
    let errorCount = 0;

    for (const courierId of couriersIds) {
      // Ищем любое не-оплаченное задание с актом (или без — попробуем финализировать)
      const task = await prisma.konsolTask.findFirst({
        where: { courierId, status: { in: ["DRAFT", "CONFIRMED"] } },
        orderBy: { date: "desc" }
      });

      if (!task) continue;

      try {
        let actId = task.konsolActId;

        // 🔥 Если акта нет в БД — пробуем финализировать прямо сейчас
        if (!actId) {
          // Принимаем задание (игнорируем ошибку если уже принято)
          try { await acceptKonsolTask(task.konsolTaskId); } catch (e) {
            console.log(`[pay] Задание ${task.konsolTaskId} уже принято или не может быть принято`);
          }

          // Финализируем — получаем actId
          const newActId = await finalizeKonsolTask(task.konsolTaskId);
          if (!newActId) {
            console.error(`[pay] Не удалось финализировать задание ${task.konsolTaskId}`);
            errorCount++;
            continue;
          }

          actId = newActId;

          // Сохраняем actId в БД
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { konsolActId: actId, status: "CONFIRMED" }
          });
        }

        // 1. Подписываем акт от лица компании
        await signKonsolAct(actId);

        // 2. Отправляем в оплату
        await autopayKonsolAct(actId);

        // 3. Обновляем статус в БД
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { status: "SIGNED_BY_US" }
        });

        // 4. Закрашиваем дни курьера как оплаченные
        const courierDates = payments
          .filter((p: any) => p.courierId === courierId)
          .map((p: any) => p.date);

        for (const d of courierDates) {
          const existing = await prisma.courierPayment.findUnique({
            where: { courierId_date: { courierId, date: d } }
          });
          if (!existing) {
            await prisma.courierPayment.create({ data: { courierId, date: d } });
          }
        }

        successCount++;

        // 5. Уведомляем курьера
        const courier = await prisma.courier.findUnique({ where: { id: courierId } });
        const user = await prisma.user.findFirst({ where: { email: courier?.email || "" } });
        if (user) {
          notify({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: "custom" as any,
            userId: user.id,
            title: "💰 Вам переведены деньги!",
            body: `Акт на сумму ${task.amount} ₽ подписан и отправлен в оплату. Деньги скоро поступят на карту!`,
            url: "https://app.konsol.pro/"
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error(`❌ Ошибка оплаты курьера ${courierId}:`, err.message || err);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, processed: successCount, errors: errorCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}