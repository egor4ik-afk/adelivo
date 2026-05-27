import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Помощник для перевода Date в строку YYYY-MM-DD
function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const session = await getSession(req as any);
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const courier = await prisma.courier.findFirst({ where: { email: session.email } });
    if (!courier) return NextResponse.json({ error: "Courier not found" }, { status: 404 });

    // 1. Текущая неделя (считаем из Order, так как они еще не удалены)
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    const mondayStr = toYMD(monday);

    const weeklyOrders = await prisma.order.findMany({
      where: { 
        courierId: courier.id, 
        status: "DELIVERED", 
        deliveryDate: { gte: mondayStr } 
      }
    });

    const weekCount = weeklyOrders.length;
    const weekTotal = Math.round(weeklyOrders.reduce((sum, o) => sum + (o.price || 0), 0) * 1.06);

    // 2. История выплат (CourierPayment) - здесь лежат данные после твоего скрипта
    const payments = await prisma.courierPayment.findMany({
      where: { courierId: courier.id },
      orderBy: { date: 'desc' },
      take: 20 // Берем последние 20 смен
    });

    const historyTotal = payments.reduce((sum, p) => sum + p.amount, 0);
    const historyCount = payments.reduce((sum, p) => sum + p.ordersCount, 0);

    return NextResponse.json({
      weekCount,
      weekTotal,
      allTimeCount: historyCount + weekCount,
      allTimeTotal: historyTotal + weekTotal,
      konsolPhone: courier.konsolPhone,
      isLinked: !!courier.konsolContractorId,
      // 🔥 Теперь фронтенд получит массив pastShifts и красиво его отрисует
      pastShifts: payments.map(p => ({
        id: p.id,
        date: p.date,
        earned: p.amount,
        ordersCount: p.ordersCount
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}