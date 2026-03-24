// src/app/api/routes/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { updateCrmOrder } from "@/lib/crm";

const STORE_COORDS = "55.749511,37.596205"; // База (магазин)

export async function POST(req: Request) {
  try {
    // Принимаем routeDate (если фронт решит его передавать в будущем)
    const { orderIds, courierId, routeType = "auto", returnToBase = false, routeDate } = await req.json();
    if (!orderIds?.length || !courierId) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

    // 🔥 ДОБАВИЛИ в select поля deliveryDate и crmCreatedAt, чтобы взять дату из заказа
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, lat: true, lng: true, crmId: true, deliveryDate: true, crmCreatedAt: true }
    });

    const sortedOrders = orderIds.map((id: string) => orders.find((o) => o.id === id)).filter(Boolean);
    const coordsList = sortedOrders.map((o: any) => o.lat && o.lng ? `${o.lat},${o.lng}` : null).filter(Boolean);
    
    // Формируем строку маршрута с учетом возврата на базу
    const rtextArr = [STORE_COORDS, ...coordsList];
    if (returnToBase) rtextArr.push(STORE_COORDS);
    
    const rtext = rtextArr.join("~");
    const link = `https://yandex.ru/maps/?rtext=${rtext}&rtt=${routeType}`;

    const routeName = `M-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // 🔥 ВЫСЧИТЫВАЕМ ПРАВИЛЬНУЮ ДАТУ МАРШРУТА
    // По умолчанию московское сегодня
    let finalRouteDate = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }); 
    
    if (routeDate) {
      finalRouteDate = routeDate;
    } else if (sortedOrders.length > 0) {
      // Берем дату доставки первого заказа из маршрута
      const firstOrder = sortedOrders[0];
      if (firstOrder.deliveryDate) {
        finalRouteDate = firstOrder.deliveryDate.split('T')[0];
      } else if (firstOrder.crmCreatedAt) {
        finalRouteDate = firstOrder.crmCreatedAt.toISOString().split('T')[0];
      }
    }

    // Создаем маршрут с правильной датой
    const newRoute = await prisma.route.create({
      data: { name: routeName, link, date: finalRouteDate, courierId: Number(courierId) }
    });

    const courierDb = await prisma.courier.findUnique({ where: { id: Number(courierId) } });
    const courierFullName = courierDb?.fullName || "";

    for (let i = 0; i < orderIds.length; i++) {
      const orderToUpdate = sortedOrders.find((o: any) => o.id === orderIds[i]);
      
      await prisma.order.update({
        where: { id: orderIds[i] },
        data: { 
          courierId: Number(courierId), 
          courier: courierFullName,
          routeId: newRoute.id, 
          routeOrder: i + 1,
          status: "ASSIGNED" 
        }
      });

      if (courierFullName && orderToUpdate?.crmId) {
        await updateCrmOrder(orderToUpdate.crmId, { 
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
    console.error("Assign route error:", e);
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}