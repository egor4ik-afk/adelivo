// src/app/api/routes/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

const STORE_COORDS = "55.749511,37.596205"; // База (магазин)

export async function POST(req: Request) {
  try {
    const { orderIds, courierId, routeType = "auto" } = await req.json();
    if (!orderIds?.length || !courierId) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

    // 1. Получаем заказы для координат
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, lat: true, lng: true }
    });

    // 2. Сортируем координаты в том порядке, в котором передал логист (по orderIds)
    const sortedOrders = orderIds.map((id: string) => orders.find((o) => o.id === id)).filter(Boolean);
    
    // 3. Генерируем ссылку на Яндекс.Навигатор/Карты
    const coordsList = sortedOrders.map((o: any) => o.lat && o.lng ? `${o.lat},${o.lng}` : null).filter(Boolean);
    const rtext = [STORE_COORDS, ...coordsList].join("~");
    const link = `https://yandex.ru/maps/?rtext=${rtext}&rtt=${routeType}`;

    const routeName = `M-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

    // 4. Создаем маршрут в БД
    const newRoute = await prisma.route.create({
      data: {
        name: routeName,
        link,
        date: today,
        courierId: Number(courierId),
      }
    });

    // 5. Привязываем заказы к маршруту
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

    // 6. Ищем курьера для отправки Пуш-уведомления
    const courierDb = await prisma.courier.findUnique({ where: { id: Number(courierId) } });
    if (courierDb && courierDb.email) {
      const courierUser = await prisma.user.findUnique({ where: { email: courierDb.email } });
      if (courierUser) {
        await notify({ 
          type: "route.assigned", 
          userId: courierUser.id, 
          routeId: newRoute.name, 
          pointsCount: orderIds.length 
        });
      }
    }

    return NextResponse.json({ success: true, routeId: newRoute.id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}