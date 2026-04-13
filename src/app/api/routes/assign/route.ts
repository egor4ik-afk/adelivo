// src/app/api/routes/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { updateCrmOrder } from "@/lib/crm";

const STORE_COORDS = "55.749511,37.596205";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      orderIds, courierId, returnToBase = false, routeDate, 
      oldRouteId, departureAdvice, isDraft, routeEtas, 
      estimatedReturnTime 
    } = body;

    let existingRouteName = null;
    let fallbackReturnTime = null;
    let fallbackAdvice = null;
    let fallbackIsDraft = false;

    if (oldRouteId) {
      // 🔥 ДОБАВЛЕНО: Подтягиваем старого курьера маршрута, чтобы знать, авто он или нет
      const oldRoute = await prisma.route.findUnique({ 
        where: { id: oldRouteId },
        include: { courier: true } 
      });

      if (oldRoute) {
        existingRouteName = oldRoute.name;
        fallbackReturnTime = oldRoute.estimatedReturnTime;
        fallbackAdvice = oldRoute.departureAdvice;
        fallbackIsDraft = oldRoute.isDraft;
      }
      
      const ordersToReset = await prisma.order.findMany({
        where: { routeId: oldRouteId, id: { notIn: orderIds || [] } }
      });

      for (const o of ordersToReset) {
        let resetPrice = o.price;
        
        // 🔥 ИСПРАВЛЕНО: Если мы выкидываем заказ из авто-маршрута, снимаем 100р надбавки
        if (oldRoute?.courier?.isAuto && resetPrice && resetPrice >= 600) {
            resetPrice -= 100;
        }

        await prisma.order.update({
          where: { id: o.id },
          data: {
            courierId: null, courier: null, routeId: null, routeOrder: null,
            status: o.status === "ASSIGNED" ? "NEW" : o.status,
            eta: null,
            price: resetPrice // 🔥 Сохраняем честную откаченную цену
          }
        });
        if (o.crmId) {
          await updateCrmOrder(o.crmId, { courier: "" }).catch(() => {});
        }
      }

      await prisma.route.deleteMany({ where: { id: oldRouteId } });
    }

    if (!orderIds?.length) return NextResponse.json({ success: true, deleted: true });
    
    if (!courierId) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, lat: true, lng: true, crmId: true, deliveryDate: true, crmCreatedAt: true, status: true, opComment: true, price: true, courierId: true }
    });

    const sortedOrders = orderIds.map((id: string) => orders.find((o) => o.id === id)).filter(Boolean);
    const coordsList = sortedOrders.map((o: any) => o.lat && o.lng ? `${o.lat},${o.lng}` : null).filter(Boolean);
    
    const courierDb = await prisma.courier.findUnique({ where: { id: Number(courierId) } });
    const courierFullName = courierDb?.fullName || "";
    const rttMode = courierDb?.isAuto ? "auto" : "mt";

    const rtextArr = [STORE_COORDS, ...coordsList];
    if (returnToBase) rtextArr.push(STORE_COORDS);
    
    const link = `https://yandex.ru/maps/?rtext=${rtextArr.join("~")}&rtt=${rttMode}`;

    let finalRouteDate = routeDate;
    if (!finalRouteDate && sortedOrders.length > 0) {
      const firstOrder = sortedOrders[0];
      if (firstOrder) {
        finalRouteDate = firstOrder.deliveryDate || (firstOrder.crmCreatedAt ? firstOrder.crmCreatedAt.split('T')[0] : null);
      }
    }
    if (!finalRouteDate) {
      finalRouteDate = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }); 
    }

    let routeName = existingRouteName;
    if (!routeName) {
      const routeDay = finalRouteDate.split('-')[2];
      const prefix = `M-${routeDay}`;
      const routes = await prisma.route.findMany({
        where: { name: { startsWith: prefix }, date: finalRouteDate },
        select: { name: true }
      });
      let maxNum = 0;
      for (const r of routes) {
        const match = r.name.match(new RegExp(`^${prefix}(\\d+)$`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      routeName = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
    }

    const newRoute = await prisma.route.create({
      data: { 
        name: routeName, 
        link, 
        date: finalRouteDate, 
        departureAdvice: departureAdvice !== undefined ? departureAdvice : fallbackAdvice, 
        courierId: Number(courierId),
        isDraft: isDraft !== undefined ? isDraft : fallbackIsDraft,
        estimatedReturnTime: estimatedReturnTime !== undefined ? estimatedReturnTime : fallbackReturnTime
      }
    });

    for (let i = 0; i < orderIds.length; i++) {
      const orderToUpdate = sortedOrders.find((o: any) => o.id === orderIds[i]);
      if (!orderToUpdate) continue;
      
      let newOpComment = orderToUpdate.opComment || "";
      if (i === 0 && (departureAdvice || fallbackAdvice)) {
        const advice = departureAdvice || fallbackAdvice;
        if (!newOpComment.includes(advice)) {
            newOpComment = `💡 ${advice}\n${newOpComment}`.trim();
        }
      }

      let currentPrice = orderToUpdate.price && orderToUpdate.price > 0 ? orderToUpdate.price : 500;
      let finalPrice = currentPrice;

      if (courierDb) {
        let basePrice = currentPrice;
        let oldCourierIsAuto = false;
        if (orderToUpdate.courierId) {
           if (orderToUpdate.courierId === courierDb.id) {
               oldCourierIsAuto = courierDb.isAuto;
           } else {
               const oldCourier = await prisma.courier.findUnique({ where: { id: orderToUpdate.courierId } });
               oldCourierIsAuto = !!oldCourier?.isAuto;
           }
        }

        // 🔥 ИСПРАВЛЕНО: Вместо жесткого массива, просто проверяем что была авто-цена >= 600
        if (oldCourierIsAuto && basePrice >= 600) {
            basePrice -= 100;
        }
        const autoSurcharge = courierDb.isAuto ? 100 : 0;
        finalPrice = basePrice + autoSurcharge;
      }

      const orderEta = routeEtas ? routeEtas[orderIds[i]] : undefined;

      await prisma.order.update({
        where: { id: orderIds[i] },
        data: { 
          courierId: Number(courierId), courier: courierFullName,
          routeId: newRoute.id, routeOrder: i + 1,
          status: orderToUpdate.status === "NEW" ? "ASSIGNED" : undefined,
          opComment: newOpComment, price: finalPrice, 
          eta: orderEta 
        }
      });
      
      if (courierFullName && orderToUpdate?.crmId) {
        await updateCrmOrder(orderToUpdate.crmId, { courier: courierFullName }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, routeId: newRoute.id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}