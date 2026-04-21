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

// Утилита для микро-пауз, чтобы Консоль успевала обновлять статусы
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

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

        // Ищем задания (DRAFT, CONFIRMED, SIGNED_BY_US, ACCEPTED)
        const task = await prisma.konsolTask.findFirst({
          where: { 
            courierId, 
            status: { in: ["CONFIRMED", "DRAFT", "SIGNED_BY_US", "ACCEPTED"] },
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

          console.log(`[Pay] Ждем генерации акта ${actId}...`);
          await delay(3000);
        }

        if (!actId) {
            errorCount++;
            continue;
        }

        // 2. УЗНАЕМ РЕАЛЬНЫЙ СТАТУС КОНСОЛИ
        const rawAct = await fetchKonsolAct(actId);
        const actData = rawAct?.data || rawAct || {};
        const actStatus = actData.status; // 'draft', 'pending', 'signed', 'paid'
        const paymentStatus = actData.payment?.status;
        const isAutopayOn = actData.autopay === true;

        console.log(`[Pay] Акт ${actId} имеет статус: ${actStatus}, статус оплаты: ${paymentStatus}`);

        // 3. БЕЗУСЛОВНОЕ ПОДПИСАНИЕ
        // Если акт не "signed" и не "paid" - ВСЕГДА пробуем подписать
        if (actStatus !== "signed" && actStatus !== "paid") {
             console.log(`[Pay] Пробуем подписать акт ${actId}...`);
             try {
               await signKonsolAct(actId);
               console.log(`[Pay] Акт ${actId} УСПЕШНО ПОДПИСАН ✅`);
               // Даем Консоли время обновить статус акта на signed
               await delay(2000); 
             } catch (signErr: any) {
               console.error(`[Pay] Ошибка подписания акта ${actId}:`, signErr.message);
               if (signErr.message.includes("404")) {
                  errorCount++;
                  continue; 
               }
             }
        } else {
             console.log(`[Pay] Акт ${actId} уже подписан (статус: ${actStatus}). Пропускаем подписание.`);
        }

        // Обновляем локальный статус
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { status: "SIGNED_BY_US" },
        });

        // 4. ЗЕЛЕНЫЕ КРУЖКИ ЗП В ИНТЕРФЕЙСЕ
        for (const d of courierDates) {
          const existing = await prisma.courierPayment.findUnique({
            where: { courierId_date: { courierId, date: d } },
          });
          if (!existing) {
            await prisma.courierPayment.create({ data: { courierId, date: d } });
          }
        }

        // 5. АВТООПЛАТА
        const alreadyInPayment = actStatus === "paid" || isAutopayOn || ["paid", "pending", "processing"].includes(paymentStatus);

        if (alreadyInPayment) {
           console.log(`[Pay] Акт ${actId} УЖЕ В ОПЛАТЕ или АВТООПЛАТЕ. Пропускаем autopay.`);
        } else {
          console.log(`[Pay] Отправляем акт ${actId} в автооплату...`);
          try {
            await autopayKonsolAct(actId);
            console.log(`[Pay] Акт ${actId} УСПЕШНО отправлен в автооплату ✅`);
          } catch (payErr: any) {
            console.error(`[Pay] Ошибка автооплаты акта ${actId}:`, payErr.message);
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