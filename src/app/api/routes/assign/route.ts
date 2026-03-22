// src/app/api/routes/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

const STORE_COORDS = "55.749511,37.596205"; // База (магазин)

export async function POST(req: Request) {
  try {
    const { orderIds, courierId, routeType = "auto" } = await req.json();
    if (!orderIds?.length || !courierId) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

    // 1. Получаем заказы
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, lat: true, lng: true }
    });

    const sortedOrders = orderIds.map((id: string) => orders.find((o) => o.id === id)).filter(Boolean);
    const coordsList = sortedOrders.map((o: any) => o.lat && o.lng ? `${o.lat},${o.lng}` : null).filter(Boolean);
    const rtext = [STORE_COORDS, ...coordsList].join("~");
    const link = `https://yandex.ru/maps/?rtext=${rtext}&rtt=${routeType}`;

    const routeName = `M-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Получаем текущую дату в формате YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    // 2. Создаем маршрут (БЕЗ использования транзакции для надежности)
    const newRoute = await prisma.route.create({
      data: {
        name: routeName,
        link,
        date: today, // 🔥 Обязательное поле добавлено
        courierId: Number(courierId),
      }
    });

    // 3. Обновляем заказы
    for (let i = 0; i < orderIds.length; i++) {
      await prisma.order.update({
        where: { id: orderIds[i] },
        data: { 
          courierId: Number(courierId), 
          routeId: newRoute.id, 
          routeOrder: i + 1,
          status: "ASSIGNED"
        }
      });
    }

    // 4. Отправляем уведомление
    const courierDb = await prisma.courier.findUnique({ where: { id: Number(courierId) } });
    if (courierDb?.email) {
      const courierUser = await prisma.user.findUnique({ where: { email: courierDb.email } });
      if (courierUser) {
        await notify({ 
          type: "route.assigned", 
          userId: courierUser.id, 
          routeId: newRoute.name, 
          pointsCount: orderIds.length 
        }).catch(console.error); // Игнорируем ошибки пушей, чтобы не ломать логику
      }
    }

    return NextResponse.json({ success: true, routeId: newRoute.id });
  } catch (e: any) {
    console.error("Assign route error:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}