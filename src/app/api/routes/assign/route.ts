// src/app/api/routes/assign/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { updateCrmOrder } from "@/lib/crm";

const STORE_COORDS = "55.749511,37.596205"; // База

export async function POST(req: Request) {
  try {
    const { orderIds, courierId, returnToBase = false, routeDate, oldRouteId, departureAdvice, isDraft, routeEtas, estimatedReturnTime } = await req.json();
    let existingRouteName = null;
    if (oldRouteId) {
      const oldRoute = await prisma.route.findUnique({ where: { id: oldRouteId } });
      if (oldRoute) existingRouteName = oldRoute.name;
      
      const ordersToReset = await prisma.order.findMany({
        where: { routeId: oldRouteId, id: { notIn: orderIds || [] } }
      });

      for (const o of ordersToReset) {
        await prisma.order.update({
          where: { id: o.id },
          data: {
            courierId: null, courier: null, routeId: null, routeOrder: null,
            status: o.status === "ASSIGNED" ? "NEW" : o.status,
            eta: null 
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
    
    // 🔥 1. Получаем данные курьера РАНЬШЕ, чтобы использовать его тип (авто/пеший) для ссылки Яндекс Карт
    const courierDb = await prisma.courier.findUnique({ where: { id: Number(courierId) } });
    const courierFullName = courierDb?.fullName || "";
    const rttMode = courierDb?.isAuto ? "auto" : "mt";

    const rtextArr = [STORE_COORDS, ...coordsList];
    if (returnToBase) rtextArr.push(STORE_COORDS);
    
    // 🔥 2. Генерируем ссылку с правильным rttMode
    const link = `https://yandex.ru/maps/?rtext=${rtextArr.join("~")}&rtt=${rttMode}`;

    // 🔥 3. Улучшенная логика даты: если с фронта не пришла, берем из первой точки
    let finalRouteDate = routeDate;
    if (!finalRouteDate && sortedOrders.length > 0) {
      const firstOrder = sortedOrders[0];
      if (firstOrder) {
        finalRouteDate = firstOrder.deliveryDate || (firstOrder.crmCreatedAt ? firstOrder.crmCreatedAt.split('T')[0] : null);
      }
    }
    // Если и в точках пусто, берем сегодняшний день
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
        departureAdvice: departureAdvice || null, 
        courierId: Number(courierId),
        isDraft: isDraft || false,
        estimatedReturnTime: estimatedReturnTime || null // 🔥 ТЕПЕРЬ СОХРАНЯЕТСЯ ПРИ СОЗДАНИИ/СОХРАНЕНИИ!
      }
    });

    for (let i = 0; i < orderIds.length; i++) {
      const orderToUpdate = sortedOrders.find((o: any) => o.id === orderIds[i]);
      if (!orderToUpdate) continue;
      
      let newOpComment = orderToUpdate.opComment || "";
      if (i === 0 && departureAdvice && !newOpComment.includes(departureAdvice)) {
        newOpComment = `💡 ${departureAdvice}\n${newOpComment}`.trim();
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

        const AUTO_PRICES = [600, 1000, 1400];
        if (oldCourierIsAuto && AUTO_PRICES.includes(basePrice)) {
            basePrice -= 100;
        }

        const autoSurcharge = courierDb.isAuto ? 100 : 0;
        finalPrice = basePrice + autoSurcharge;
      }

      // 🔥 Берем ETA конкретно для этого заказа из присланных данных Яндекса
      const orderEta = routeEtas ? routeEtas[orderIds[i]] : undefined;

      await prisma.order.update({
        where: { id: orderIds[i] },
        data: { 
          courierId: Number(courierId), courier: courierFullName,
          routeId: newRoute.id, routeOrder: i + 1,
          status: orderToUpdate.status === "NEW" ? "ASSIGNED" : undefined,
          opComment: newOpComment, price: finalPrice, 
          eta: orderEta // Сохраняем первичный ПЛАН!
        }
      });
      
      if (courierFullName && orderToUpdate?.crmId) {
        await updateCrmOrder(orderToUpdate.crmId, { courier: courierFullName }).catch(() => {});
      }
    }

    if (courierDb?.email && !oldRouteId && !isDraft) {
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