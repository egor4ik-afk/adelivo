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
    const warnings: string[] = [];

    for (const courierId of couriersIds) {
      try {
        // Собираем даты выбранных смен, чтобы не захватить случайно задание будущей недели
        const courierDates = payments
          .filter((p: any) => p.courierId === courierId)
          .map((p: any) => p.date)
          .sort();
        
        // Берем последнюю дату из выбранных смен + даем запас пару дней
        const maxDate = new Date(courierDates[courierDates.length - 1]);
        maxDate.setDate(maxDate.getDate() + 2);

        // 🔥 ПРАВКА 1: Добавили SIGNED_BY_US
        // 🔥 ПРАВКА 2: Ограничили поиск датой (lte: maxDate), чтобы не взять свежий DRAFT новой недели
        const task = await prisma.konsolTask.findFirst({
          where: { 
            courierId, 
            status: { in: ["CONFIRMED", "DRAFT", "SIGNED_BY_US"] },
            date: { lte: maxDate }
          },
          orderBy: { date: "desc" },
        });

        if (!task) {
          console.log(`[Pay] Нет задания для курьера ${courierId}`);
          continue;
        }

        let actId = task.konsolActId;

        // ── Шаг 1: если акта нет — финализируем на лету ──────────────────
        // Пропускаем этот шаг, если акт уже подписан
        if (!actId && task.status !== "SIGNED_BY_US") {
          console.log(`[Pay] Финализируем задание ${task.konsolTaskId}...`);
          try { await acceptKonsolTask(task.konsolTaskId); } catch {
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
        }

        // ── Шаг 2: подписываем акт (если еще не подписан) ────────────────
        if (task.status !== "SIGNED_BY_US" && actId) {
          try {
            await signKonsolAct(actId);
            console.log(`[Pay] Акт ${actId} подписан ✅`);
          } catch (signErr: any) {
            console.error(`[Pay] Ошибка подписания акта ${actId}:`, signErr.message);
            errorCount++;
            continue;
          }

          // ── Шаг 3: сохраняем SIGNED_BY_US сразу после подписания ─────────
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { status: "SIGNED_BY_US" },
          });
        }

        // Зелёные кружки в таблице ЗП (отмечаем как оплаченные)
        for (const d of courierDates) {
          const existing = await prisma.courierPayment.findUnique({
            where: { courierId_date: { courierId, date: d } },
          });
          if (!existing) {
            await prisma.courierPayment.create({ data: { courierId, date: d } });
          }
        }

        // ── Шаг 4: автооплата ─────────────────────────────────────────────
        if (actId) {
          try {
            await autopayKonsolAct(actId);
            console.log(`[Pay] Акт ${actId} отправлен в автооплату ✅`);
          } catch (payErr: any) {
            console.error(`[Pay] Autopay акта ${actId}:`, payErr.message);
            const match = payErr.message.match(/"message":"([^"]+)"/);
            const humanMsg = match ? match[1] : payErr.message;
            warnings.push(`Акт ${actId}: ${humanMsg}`);
          }
        }

        successCount++;

        // Пуш курьеру (отправляем только если это новая оплата, чтобы не спамить при "повторных" попытках)
        if (task.status !== "SIGNED_BY_US") {
          const courier = await prisma.courier.findUnique({ where: { id: courierId } });
          const user = await prisma.user.findFirst({ where: { email: courier?.email || "" } });
          if (user) {
            notify({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: "custom" as any,
              userId: user.id,
              title: "📝 Акт подписан",
              body: `Акт на сумму ${task.amount} ₽ подписан. Оплата поступит в ближайшее время.`,
              url: "https://app.konsol.pro/",
            }).catch(() => {});
          }
        }
      } catch (err: any) {
        console.error(`❌ [Pay] Ошибка курьера ${courierId}:`, err.message || err);
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: successCount,
      errors: errorCount,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}