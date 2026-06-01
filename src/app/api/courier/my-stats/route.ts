// src/app/api/courier/my-stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const session = await getSession(req as any);
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const courier = await prisma.courier.findFirst({ where: { email: session.email } });
    if (!courier) return NextResponse.json({ error: "Courier not found" }, { status: 404 });

    // 1. ИСТОРИЯ: Только то, что РЕАЛЬНО ВЫПЛАЧЕНО (есть запись в CourierPayment)
    const payments = await prisma.courierPayment.findMany({
      where: { courierId: courier.id },
      orderBy: { date: 'desc' }
    });

    // Создаем Set из дат, которые уже оплачены, чтобы легко их отфильтровывать
    const paidDates = new Set(payments.map(p => p.date));

    // Считаем точные суммы только по выплаченному
    const historyTotal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const historyCount = payments.reduce((sum, p) => sum + (p.ordersCount || 0), 0);

    // 2. ПРЕДВАРИТЕЛЬНО: Эта и прошлая неделя (НЕОПЛАЧЕННЫЕ дни)
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    
    // Отсчитываем до понедельника ПРОШЛОЙ недели
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - dayOfWeek - 6);
    const lastMondayStr = toYMD(lastMonday);
    
    // Достаем все заказы начиная с прошлой недели
    const recentOrders = await prisma.order.findMany({
      where: { 
        courierId: courier.id, 
        status: "DELIVERED", 
        deliveryDate: { gte: lastMondayStr } 
      }
    });

    // Оставляем только заказы за те дни, которых ЕЩЕ НЕТ в таблице оплат
    const unpaidOrders = recentOrders.filter(o => {
      const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.toISOString().split('T')[0] : null);  
          return oDate && !paidDates.has(oDate);
    });

    const preliminaryCount = unpaidOrders.length;
    const preliminaryTotal = Math.round(unpaidOrders.reduce((sum, o) => sum + (o.price || 0), 0) * 1.06);

    return NextResponse.json({
      weekCount: preliminaryCount,
      weekTotal: preliminaryTotal,
      
      // 🔥 Теперь сюда ничего не плюсуется из текущей недели, только выплаченное
      allTimeCount: historyCount, 
      allTimeTotal: historyTotal, 
      
      konsolPhone: courier.konsolPhone,
      isLinked: !!courier.konsolContractorId,
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