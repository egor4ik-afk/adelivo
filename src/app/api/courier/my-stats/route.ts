// src/app/api/courier/my-stats/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Помощник для перевода Date в строку YYYY-MM-DD
function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (!session?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const courier = await prisma.courier.findFirst({ where: { email: session.email } });
    if (!courier) return NextResponse.json({ error: "Courier not found" }, { status: 404 });

    // Границы текущей недели (ПН-ВСК)
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek + 1);
    const mondayStr = toYMD(monday); // 🔥 Переводим в строку

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = toYMD(sunday); // 🔥 Переводим в строку

    // Заказы за неделю
    const weeklyOrders = await prisma.order.findMany({
      where: { 
        courierId: courier.id, 
        status: "DELIVERED", 
        deliveryDate: { gte: mondayStr, lte: sundayStr } // Теперь фильтруем по строкам
      }
    });
    
    // Заказы за все время
    const allTimeOrders = await prisma.order.findMany({
      where: { courierId: courier.id, status: "DELIVERED" }
    });

    const weeklyBase = weeklyOrders.reduce((sum, o) => sum + (o.price || 0), 0);
    const allTimeBase = allTimeOrders.reduce((sum, o) => sum + (o.price || 0), 0);

    return NextResponse.json({
      weekCount: weeklyOrders.length,
      weekTotal: Math.round(weeklyBase * 1.06), // +6%
      allTimeCount: allTimeOrders.length,
      allTimeTotal: Math.round(allTimeBase * 1.06), // +6%
      konsolPhone: courier.konsolPhone,
      isLinked: !!courier.konsolContractorId
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}