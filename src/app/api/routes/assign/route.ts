// src/app/api/routes/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { updateCrmOrder } from "@/lib/crm"; // 🔥 ДОБАВИЛИ ИМПОРТ

const STORE_COORDS = "55.749511,37.596205"; 

export async function POST(req: Request) {
  try {
    const { orderIds, courierId, routeType = "auto" } = await req.json();
    if (!orderIds?.length || !courierId) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, lat: true, lng: true, crmId: true } // 🔥 Добавили crmId для выгрузки в CRM
    });

    const sortedOrders = orderIds.map((id: string) => orders.find((o) => o.id === id)).filter(Boolean);
    const coordsList = sortedOrders.map((o: any) => o.lat && o.lng ? `${o.lat},${o.lng}` : null).filter(Boolean);
    const rtext = [STORE_COORDS, ...coordsList].join("~");
    const link = `https://yandex.ru/maps/?rtext=${rtext}&rtt=${routeType}`;

    const routeName = `M-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().split('T')[0];

    const newRoute = await prisma.route.create({
      data: { name: routeName, link, date: today, courierId: Number(courierId) }
    });

    // 🔥 Ищем имя курьера, чтобы передать его в CRM
    const courierDb = await prisma.courier.findUnique({ where: { id: Number(courierId) } });
    const courierFullName = courierDb?.fullName || "";

    // Обновляем заказы локально И выгружаем в CRM
    for (let i = 0; i < orderIds.length; i++) {
      const orderToUpdate = sortedOrders.find((o: any) => o.id === orderIds[i]);
      
      await prisma.order.update({
        where: { id: orderIds[i] },
        data: { 
          courierId: Number(courierId), 
          courier: courierFullName, // 🔥 Локально тоже записываем имя, чтобы дашборд сразу обновился
          routeId: newRoute.id, 
          routeOrder: i + 1,
          status: "ASSIGNED"
        }
      });

      // 🔥 ОТПРАВЛЯЕМ КУРЬЕРА И СТАТУС В RETAILCRM
      if (courierFullName && orderToUpdate?.crmId) {
        await updateCrmOrder(orderToUpdate.crmId, { 
          status: "ASSIGNED", 
          courier: courierFullName 
        }).catch(err => console.error(`[CRM Sync] Ошибка для ${orderToUpdate.crmId}:`, err));
      }
    }

    if (courierDb?.email) {
      const courierUser = await prisma.user.findUnique({ where: { email: courierDb.email } });
      if (courierUser) {
        await notify({ 
          type: "route.assigned", userId: courierUser.id, routeId: newRoute.name, pointsCount: orderIds.length 
        }).catch(console.error); 
      }
    }

    return NextResponse.json({ success: true, routeId: newRoute.id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}