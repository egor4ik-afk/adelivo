// src/app/api/cron/konsol/weekly/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { getSession } from "@/lib/auth";
import { addKonsolDuty, acceptKonsolTask, finalizeKonsolTask, signKonsolAct } from "@/lib/konsol";

// Помощник для перевода Date в строку YYYY-MM-DD
function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  // Разрешаем доступ либо по CRON секрету, либо если это Админ/Оператор из браузера
  const authHeader = req.headers.get("authorization");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // 🔥 Строки для фильтрации таблицы Order (YYYY-MM-DD)
    const mondayStr = toYMD(monday);
    const sundayStr = toYMD(sunday);

    const tasks = await prisma.konsolTask.findMany({
      where: { date: { gte: monday, lte: sunday }, status: "DRAFT" },
      include: { courier: true }
    });

    let successCount = 0;

    for (const task of tasks) {
      if (!task.konsolTaskId) continue;

      // 🔥 Используем строковые даты для поиска
      const weeklyOrders = await prisma.order.findMany({
        where: { 
          courierId: task.courier.id, 
          status: "DELIVERED", 
          deliveryDate: { gte: mondayStr, lte: sundayStr } 
        }
      });

      // Группируем заказы по цене (+6% налога)
      const dutyGroups: Record<number, number> = {};
      let deliveriesTotal = 0;

      for (const o of weeklyOrders) {
        const orderPrice = o.price || 0;
        if (orderPrice > 0) {
          const finalPrice = Math.round(orderPrice * 1.06);
          dutyGroups[finalPrice] = (dutyGroups[finalPrice] || 0) + 1;
          deliveriesTotal += finalPrice;
        }
      }

      // 1. Добавляем сгруппированные услуги в Консоль
      for (const [priceStr, qty] of Object.entries(dutyGroups)) {
        const p = Number(priceStr);
        await addKonsolDuty(task.konsolTaskId, `Услуги доставки`, p, qty);
      }

      // 2. Принимаем задание
      await acceptKonsolTask(task.konsolTaskId);

      // 3. Формируем Акт
      const actId = await finalizeKonsolTask(task.konsolTaskId);

      if (actId) {
        // 4. Подписываем Акт
        await signKonsolAct(actId);

        // Обновляем БД (Базовая сумма + сумма всех доставок)
        const newTotalAmount = task.amount + deliveriesTotal;
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { amount: newTotalAmount, konsolActId: String(actId), status: "SIGNED_BY_US" }
        });

        successCount++;

        // 5. Пуш курьеру
        const user = await prisma.user.findUnique({ where: { email: task.courier.email || "" } });
        if (user) {
          notify({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: "custom" as any,
            userId: user.id,
            title: "💰 Акт сформирован!",
            body: `Вам начислено ${newTotalAmount} ₽. Проверьте и подпишите акт в приложении Консоль.Про.`,
            url: "https://konsol.pro/"
          }).catch(console.error);
        }
      }
    }

    return NextResponse.json({ success: true, processed: successCount, total: tasks.length });
  } catch (error: any) {
    console.error("[Konsol Sync Error]:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}