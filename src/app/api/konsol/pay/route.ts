// src/app/api/konsol/pay/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { signKonsolAct, autopayKonsolAct, acceptKonsolTask, finalizeKonsolTask } from "@/lib/konsol";

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

        // Ищем задания (DRAFT, CONFIRMED, SIGNED_BY_US)
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

        // 1. ФИНАЛИЗАЦИЯ (если акта еще нет)
        if (!actId) {
          console.log(`[Pay] Финализируем задание ${task.konsolTaskId}...`);
          try { await acceptKonsolTask(task.konsolTaskId); } catch {}

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

        if (!actId) {
            errorCount++;
            continue;
        }

        // 2. УМНАЯ ПРОВЕРКА РЕАЛЬНОГО СТАТУСА КОНСОЛИ
        const rawAct = await fetchKonsolAct(actId);
        const actData = rawAct?.data || rawAct || {};
        const actStatus = actData.status;
        const paymentStatus = actData.payment?.status;
        
        // Флаги на основе реальных данных из API
        const isFullySigned = actStatus === "signed" || actStatus === "paid" || ["paid", "pending", "processing"].includes(paymentStatus);
        const isPaid = actStatus === "paid" || ["paid", "pending", "processing"].includes(paymentStatus);

        // 3. ПОДПИСАНИЕ (Только если акт действительно не подписан в Консоли)
        if (!isFullySigned) {
             try {
               await signKonsolAct(actId);
               console.log(`[Pay] Акт ${actId} подписан ✅`);
             } catch (signErr: any) {
               console.error(`[Pay] Ошибка подписания акта ${actId}:`, signErr.message);
               // 404 означает, что акт уже перешел на следующий этап
               if (!signErr.message.includes("404")) {
                  errorCount++;
                  continue; 
               }
             }
        } else {
             console.log(`[Pay] Акт ${actId} УЖЕ БЫЛ подписан (статус: ${actStatus}).`);
        }

        // Записываем финальный успешный статус к нам в БД
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { status: "SIGNED_BY_US" },
        });

        // 4. ЗЕЛЕНЫЕ КРУЖКИ ЗП
        for (const d of courierDates) {
          const existing = await prisma.courierPayment.findUnique({
            where: { courierId_date: { courierId, date: d } },
          });
          if (!existing) {
            await prisma.courierPayment.create({ data: { courierId, date: d } });
          }
        }

        // 5. АВТООПЛАТА
        if (isPaid) {
           console.log(`[Pay] Акт ${actId} УЖЕ В ОПЛАТЕ (статус: ${paymentStatus || actStatus}). Пропускаем autopay.`);
        } else {
          try {
            await autopayKonsolAct(actId);
            console.log(`[Pay] Акт ${actId} отправлен в автооплату ✅`);
          } catch (payErr: any) {
            console.error(`[Pay] Autopay акта ${actId}:`, payErr.message);
            const match = payErr.message.match(/"message":"([^"]+)"/);
            const humanMsg = match ? match[1] : payErr.message;
            
            if (!humanMsg.includes("Нельзя оплатить акты из текущего статуса")) {
                warnings.push(`Акт ${actId}: ${humanMsg}`);
            }
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