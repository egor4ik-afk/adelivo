// src/app/api/konsol/pay/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { signKonsolAct, autopayKonsolAct } from "@/lib/konsol";
import { notify } from "@/lib/notifications";

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

        // Ищем задание (в любом активном статусе)
        const task = await prisma.konsolTask.findFirst({
          where: { 
            courierId, 
            status: { in: ["CONFIRMED", "DRAFT", "SIGNED_BY_US", "ACCEPTED", "CONFIRMED_ACT"] },
            date: { lte: maxDate }
          },
          orderBy: { date: "desc" },
        });

        if (!task) {
          console.log(`[Pay] Нет задания для курьера ${courierId}`);
          continue;
        }

        const actId = task.konsolActId;

        // Если акта нет — просто пропускаем, как ты и просил
        if (!actId) {
          console.log(`[Pay] Пропуск: у задания ${task.konsolTaskId} курьера ${courierId} еще нет акта.`);
          warnings.push(`Курьер ${courierId}: нет выпущенного акта для задания.`);
          errorCount++;
          continue;
        }

        // 1. БЕЗУСЛОВНОЕ ПОДПИСАНИЕ
        console.log(`[Pay] Пробуем подписать акт ${actId}...`);
        try {
          await signKonsolAct(actId);
          console.log(`[Pay] Акт ${actId} УСПЕШНО ПОДПИСАН ✅`);
          await delay(2000); // Даем Консоли 2 сек на смену статуса
        } catch (signErr: any) {
          console.error(`[Pay] Ошибка подписания акта ${actId}:`, signErr.message);
          // Если 404 - значит акт УЖЕ подписан или недоступен для подписи. Идем дальше.
          if (signErr.message.includes("404")) {
             console.log(`[Pay] Игнорируем 404. Считаем, что акт ${actId} уже подписан.`);
          } else {
             errorCount++;
             continue; 
          }
        }

        // Обновляем локальный статус (Акт точно подписан)
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { status: "SIGNED_BY_US" },
        });

        // 2. БЕЗУСЛОВНАЯ АВТООПЛАТА
        console.log(`[Pay] Отправляем акт ${actId} в автооплату...`);
        try {
          await autopayKonsolAct(actId);
          console.log(`[Pay] Акт ${actId} УСПЕШНО отправлен в автооплату ✅`);
        } catch (payErr: any) {
          console.error(`[Pay] Ошибка автооплаты акта ${actId}:`, payErr.message);
          
          // Если Консоль говорит "Нельзя оплатить", значит акт УЖЕ в оплате или оплачен.
          if (payErr.message.includes("Нельзя оплатить акты из текущего статуса") || payErr.message.includes("уже оплачен")) {
             console.log(`[Pay] Акт ${actId} УЖЕ в оплате или оплачен. Считаем успехом.`);
          } else {
             const match = payErr.message.match(/"message":"([^"]+)"/);
             const humanMsg = match ? match[1] : payErr.message;
             warnings.push(`Акт ${actId}: ${humanMsg}`);
          }
        }

        // 3. ЗАЖИГАЕМ ЗЕЛЕНЫЕ КРУЖКИ В ИНТЕРФЕЙСЕ (только после успешного прохождения)
        for (const d of courierDates) {
          const existing = await prisma.courierPayment.findUnique({
            where: { courierId_date: { courierId, date: d } },
          });
          if (!existing) {
            await prisma.courierPayment.create({ data: { courierId, date: d } });
          }
        }

        successCount++;

        // 🔥 ОТПРАВЛЯЕМ ПУШ ОБ ОПЛАТЕ
        const courierData = await prisma.courier.findUnique({ 
          where: { id: courierId }, 
          select: { email: true } 
        });
        
        if (courierData?.email) {
          // Берем последнюю дату из оплачиваемых как ориентир для текста пуша
          const lastDateFormatted = new Date(courierDates[courierDates.length - 1]).toLocaleDateString("ru-RU");
          
          await notify({
            type: "konsol.paid",
            courierEmail: courierData.email,
            date: lastDateFormatted,
          }).catch(e => console.error("Push pay error:", e));
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