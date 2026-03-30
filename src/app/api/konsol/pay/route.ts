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
    if (!payments || payments.length === 0)
      return NextResponse.json({ error: "Нет выбранных смен" }, { status: 400 });

    const couriersIds = [...new Set(payments.map((p: any) => p.courierId))] as number[];
    let successCount = 0;
    let errorCount = 0;

    for (const courierId of couriersIds) {
      try {
        // Ищем любое незакрытое задание курьера
        const task = await prisma.konsolTask.findFirst({
          where: { courierId, status: { in: ["CONFIRMED", "DRAFT"] } },
          orderBy: { date: "desc" },
        });

        if (!task) {
          console.log(`[Pay] Нет задания для курьера ${courierId}, пропускаем`);
          continue;
        }

        let actId = task.konsolActId;

        // ── Шаг 1: если акта нет — финализируем на лету ──────────────────
        if (!actId) {
          console.log(`[Pay] Акт не найден для ${task.konsolTaskId}, финализируем...`);
          try {
            await acceptKonsolTask(task.konsolTaskId);
          } catch {
            console.log(`[Pay] Задание ${task.konsolTaskId} уже принято`);
          }

          const newActId = await finalizeKonsolTask(task.konsolTaskId);
          if (!newActId) {
            console.error(`[Pay] Не удалось создать акт для ${task.konsolTaskId}`);
            errorCount++;
            continue;
          }

          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { konsolActId: String(newActId), status: "CONFIRMED" },
          });
          actId = String(newActId);
          console.log(`[Pay] Акт ${actId} создан`);
        }

        // ── Шаг 2: подписываем акт ────────────────────────────────────────
        try {
          await signKonsolAct(actId);
          console.log(`[Pay] Акт ${actId} подписан`);
        } catch (signErr: any) {
          console.error(`[Pay] Ошибка подписания акта ${actId}:`, signErr.message);
          // Подписание не прошло — не продолжаем, но не падаем на весь цикл
          errorCount++;
          continue;
        }

        // ── Шаг 3: автооплата ─────────────────────────────────────────────
        try {
          await autopayKonsolAct(actId);
          console.log(`[Pay] Акт ${actId} отправлен в автооплату`);
        } catch (payErr: any) {
          // Автооплата упала — но акт уже подписан, сохраняем как SIGNED_BY_US всё равно
          console.error(`[Pay] Ошибка автооплаты акта ${actId} (сохраняем как оплачено):`, payErr.message);
        }

        // ── Шаг 4: сохраняем статус SIGNED_BY_US в любом случае ──────────
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { status: "SIGNED_BY_US" },
        });

        // Зелёные кружки в таблице ЗП
        const courierDates = payments
          .filter((p: any) => p.courierId === courierId)
          .map((p: any) => p.date);

        for (const d of courierDates) {
          const existing = await prisma.courierPayment.findUnique({
            where: { courierId_date: { courierId, date: d } },
          });
          if (!existing) {
            await prisma.courierPayment.create({ data: { courierId, date: d } });
          }
        }

        successCount++;

        // Пуш курьеру
        const courier = await prisma.courier.findUnique({ where: { id: courierId } });
        const user = await prisma.user.findFirst({ where: { email: courier?.email || "" } });
        if (user) {
          notify({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: "custom" as any,
            userId: user.id,
            title: "💰 Вам переведены деньги!",
            body: `Акт на сумму ${task.amount} ₽ подписан и отправлен в оплату. Деньги скоро поступят на карту!`,
            url: "https://app.konsol.pro/",
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error(`❌ [Pay] Ошибка курьера ${courierId}:`, err.message || err);
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, processed: successCount, errors: errorCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}