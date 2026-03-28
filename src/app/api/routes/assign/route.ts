// src/app/api/routes/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { updateCrmOrder } from "@/lib/crm";

const STORE_COORDS = "55.749511,37.596205"; // База

export async function POST(req: Request) {
  try {
    const { orderIds, courierId, routeType = "auto", returnToBase = false, routeDate, oldRouteId, departureAdvice } = await req.json();

    let existingRouteName = null;
    if (oldRouteId) {
      const oldRoute = await prisma.route.findUnique({ where: { id: oldRouteId } });
      if (oldRoute) existingRouteName = oldRoute.name;
      await prisma.route.deleteMany({ where: { id: oldRouteId } });
    }

    if (!orderIds?.length) return NextResponse.json({ success: true, deleted: true });
    if (!courierId) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, lat: true, lng: true, crmId: true, deliveryDate: true, crmCreatedAt: true, status: true, opComment: true }
    });

    const sortedOrders = orderIds.map((id: string) => orders.find((o) => o.id === id)).filter(Boolean);
    const coordsList = sortedOrders.map((o: any) => o.lat && o.lng ? `${o.lat},${o.lng}` : null).filter(Boolean);
    
    const rtextArr = [STORE_COORDS, ...coordsList];
    if (returnToBase) rtextArr.push(STORE_COORDS);
    const link = `https://yandex.ru/maps/?rtext=${rtextArr.join("~")}&rtt=${routeType}`;

    let finalRouteDate = routeDate || new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }); 

   let routeName = existingRouteName;
    if (!routeName) {
      const routeDay = finalRouteDate.split('-')[2];
      const prefix = `M-${routeDay}`;

      // Безопасный поиск максимального номера маршрута ИМЕННО ЗА ЭТОТ ДЕНЬ
      const routes = await prisma.route.findMany({
        where: { 
          name: { startsWith: prefix },
          date: finalRouteDate // 🔥 ДОБАВИТЬ ЭТУ СТРОКУ
        },
        select: { name: true }
      });

      let maxNum = 0;
      for (const r of routes) {
        // Ищем любые цифры после префикса (например M-28001 или M-281)
        const match = r.name.match(new RegExp(`^${prefix}(\\d+)$`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }

      routeName = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
    }

    const newRoute = await prisma.route.create({
      data: { name: routeName, link, date: finalRouteDate, departureAdvice: departureAdvice || null, courierId: Number(courierId) }
    });

    const courierDb = await prisma.courier.findUnique({ where: { id: Number(courierId) } });
    const courierFullName = courierDb?.fullName || "";

    for (let i = 0; i < orderIds.length; i++) {
      const orderToUpdate = sortedOrders.find((o: any) => o.id === orderIds[i]);
      
      // 🔥 Если это первая точка в маршруте и есть совет - пишем его в коммент оператора!
      let newOpComment = orderToUpdate.opComment || "";
      if (i === 0 && departureAdvice && !newOpComment.includes(departureAdvice)) {
        newOpComment = `💡 ${departureAdvice}\n${newOpComment}`.trim();
      }

      await prisma.order.update({
        where: { id: orderIds[i] },
        data: { 
          courierId: Number(courierId), courier: courierFullName,
          routeId: newRoute.id, routeOrder: i + 1,
          status: orderToUpdate.status === "NEW" ? "ASSIGNED" : undefined,
          opComment: newOpComment
        }
      });
      if (courierFullName && orderToUpdate?.crmId) {
        await updateCrmOrder(orderToUpdate.crmId, { courier: courierFullName }).catch(() => {});
      }
    }

    if (courierDb?.email && !oldRouteId) {
      const courierUser = await prisma.user.findUnique({ where: { email: courierDb.email } });
      if (courierUser) {
        await notify({ type: "route.assigned", userId: courierUser.id, routeId: newRoute.name, pointsCount: orderIds.length }).catch(console.error); 
      }
    }

    return NextResponse.json({ success: true, routeId: newRoute.id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}