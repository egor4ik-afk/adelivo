// src/app/api/konsol/pay/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { signKonsolAct, autopayKonsolAct } from "@/lib/konsol";

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { payments } = await req.json(); // Массив смен
    if (!payments || payments.length === 0) return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });

    const couriersIds = [...new Set(payments.map((p: any) => p.courierId))] as number[];
    let successCount = 0;
    let errorCount = 0;

    for (const courierId of couriersIds) {
      // Ищем задание в статусе CONFIRMED (Акт уже создан на предыдущем шаге)
      const task = await prisma.konsolTask.findFirst({
        where: { courierId, status: "CONFIRMED" },
        orderBy: { date: "desc" }
      });

      // Проверяем, что задание найдено и у него есть сохраненный ID акта
      if (!task || !task.konsolActId) continue;

      try {
        // 1. Подписываем готовый Акт от лица компании
        await signKonsolAct(task.konsolActId);
        // 2. Отправляем в оплату
        await autopayKonsolAct(task.konsolActId);

        // Обновляем статус в БД на "Оплачено"
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { status: "SIGNED_BY_US" }
        });

        // Закрашиваем дни курьера как "оплачено" в нашей базе (зеленые кружки)
        const courierDates = payments.filter((p: any) => p.courierId === courierId).map((p: any) => p.date);
        for (const d of courierDates) {
          const existing = await prisma.courierPayment.findUnique({
            where: { courierId_date: { courierId, date: d } }
          });
          if (!existing) {
            await prisma.courierPayment.create({ data: { courierId, date: d } });
          }
        }

        successCount++;

        // Уведомляем курьера о выплате
        const courier = await prisma.courier.findUnique({ where: { id: courierId } });
        const user = await prisma.user.findFirst({ where: { email: courier?.email || "" } });
        if (user) {
          notify({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: "custom" as any,
            userId: user.id,
            title: "💰 Вам переведены деньги!",
            body: `Акт на сумму ${task.amount} ₽ подписан и отправлен в оплату. Деньги скоро поступят на карту!`,
            url: "https://konsol.pro/"
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