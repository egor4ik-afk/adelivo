// src/app/api/routes/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { updateCrmOrder } from "@/lib/crm";

const STORE_COORDS = "55.749511,37.596205"; // База (магазин)

export async function POST(req: Request) {
  try {
    // 🔥 ДОБАВИЛИ returnToBase
    const { orderIds, courierId, routeType = "auto", returnToBase = false } = await req.json();
    if (!orderIds?.length || !courierId) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, lat: true, lng: true, crmId: true }
    });

    const sortedOrders = orderIds.map((id: string) => orders.find((o) => o.id === id)).filter(Boolean);
    const coordsList = sortedOrders.map((o: any) => o.lat && o.lng ? `${o.lat},${o.lng}` : null).filter(Boolean);
    
    // 🔥 Формируем строку маршрута с учетом возврата на базу
    const rtextArr = [STORE_COORDS, ...coordsList];
    if (returnToBase) rtextArr.push(STORE_COORDS);
    
    const rtext = rtextArr.join("~");
    const link = `https://yandex.ru/maps/?rtext=${rtext}&rtt=${routeType}`;

    const routeName = `M-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().split('T')[0];

    const newRoute = await prisma.route.create({
      data: { name: routeName, link, date: today, courierId: Number(courierId) }
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