// src/app/api/konsol/pay/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { signKonsolAct, autopayKonsolAct, acceptKonsolTask, finalizeKonsolTask } from "@/lib/konsol";

// Вспомогательная функция для проверки статуса акта напрямую
async function fetchKonsolAct(actId: string) {
  const res = await fetch(`https://api.konsol.pro/v2/acts/${actId}`, {
    headers: {
      "Authorization": `Bearer ${process.env.KONSOL_API_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store"
  });
  if (!res.ok) return null;
  return res.json();
}

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
        const courierDates = payments
          .filter((p: any) => p.courierId === courierId)
          .map((p: any) => p.date)
          .sort();
        
        const maxDate = new Date(courierDates[courierDates.length - 1]);
        maxDate.setDate(maxDate.getDate() + 2);

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

        // ── Шаг 2: подписываем акт (УМНАЯ ПРОВЕРКА) ──────────────────────
        if (task.status !== "SIGNED_BY_US" && actId) {
          // 🔥 Проверяем реальный статус акта в Консоли перед подписанием
          const actData = await fetchKonsolAct(actId);
          const actStatus = actData?.status;
          
          const isAlreadySigned = actStatus === "signed" || actStatus === "paid" || actData?.payment?.status === "paid" || actData?.payment?.status === "pending";

          if (isAlreadySigned) {
             console.log(`[Pay] Акт ${actId} УЖЕ БЫЛ подписан вручную (статус: ${actStatus}). Пропускаем подписание.`);
          } else {
             try {
               await signKonsolAct(actId);
               console.log(`[Pay] Акт ${actId} подписан ✅`);
             } catch (signErr: any) {
               console.error(`[Pay] Ошибка подписания акта ${actId}:`, signErr.message);
               // Если 404 - значит акт не найден в пуле ожидающих подписания (вероятно, уже подписан)
               if (signErr.message.includes("404")) {
                  console.log(`[Pay] Игнорируем 404: акт ${actId} уже подписан или передан в оплату.`);
               } else {
                  errorCount++;
                  continue; // Прерываем только при реальных ошибках (например, 400 или 500)
               }
             }
          }

          // Сохраняем статус
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { status: "SIGNED_BY_US" },
          });
        }

        // Зелёные кружки в таблице ЗП
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