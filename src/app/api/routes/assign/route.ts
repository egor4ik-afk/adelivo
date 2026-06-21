import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify, createManagerPlaque } from "@/lib/notifications"; // 🔥 ДОБАВЛЕН ИМПОРТ ПЛАШКИ
import { updateCrmOrder } from "@/lib/crm";
import { getSession } from "@/lib/auth"; // 🔥 ДОБАВЛЕН ИМПОРТ СЕССИИ (чтобы знать, кто логист)

const STORE_COORDS = "55.749511,37.596205";

export async function POST(req: Request) {
  try {
    // 🔥 Получаем данные логиста, который сейчас сохраняет маршрут
    const session = await getSession();
    const authorName = session?.firstName 
      ? `${session.firstName} ${session.lastName || ''}`.trim() 
      : "Логист";

    const body = await req.json();
    const { 
      orderIds, courierId, returnToBase = false, routeDate, 
      oldRouteId, departureAdvice, isDraft, routeEtas, 
      estimatedReturnTime, plannedDepartureTime 
    } = body;

    let existingRouteName = null;
    let fallbackReturnTime = null;
    let fallbackAdvice = null;
    let fallbackIsDraft = false;
    let fallbackPlannedTime = null; 
    let fallbackIsAccepted = false; 
    
    // Переменные для контроля уведомлений
    let oldCourierId = null;
    let pointsChanged = true;

    if (oldRouteId) {
      const oldRoute = await prisma.route.findUnique({ 
        where: { id: oldRouteId },
        include: { courier: true } 
      });

      if (oldRoute) {
        existingRouteName = oldRoute.name;
        fallbackReturnTime = oldRoute.estimatedReturnTime;
        fallbackAdvice = oldRoute.departureAdvice;
        fallbackPlannedTime = oldRoute.plannedDepartureTime; 
        fallbackIsDraft = oldRoute.isDraft;
        oldCourierId = oldRoute.courierId;

        if (oldRoute.courierId === Number(courierId)) {
            fallbackIsAccepted = oldRoute.isAccepted;
        }
      }
      
      const oldOrders = await prisma.order.findMany({
        where: { routeId: oldRouteId }
      });
      
      const oldOrderIdsStr = oldOrders.map(o => o.id).sort().join(',');
      const newOrderIdsStr = [...(orderIds || [])].sort().join(',');
      
      if (oldOrderIdsStr === newOrderIdsStr) {
         pointsChanged = false; 
      }

      const ordersToReset = oldOrders.filter(o => !(orderIds || []).includes(o.id));

      for (const o of ordersToReset) {
        let resetPrice = o.price;
        
        if (oldRoute?.courier?.isAuto && resetPrice && resetPrice >= 600) {
            resetPrice -= 100;
        }

        await prisma.order.update({
          where: { id: o.id },
          data: {
            courierId: null, courier: null, routeId: null, routeOrder: null,
            status: o.status === "ASSIGNED" ? "NEW" : o.status,
            eta: null,
            price: resetPrice 
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
        plannedDepartureTime: plannedDepartureTime !== undefined ? plannedDepartureTime : fallbackPlannedTime,
        departureAdvice: departureAdvice !== undefined ? departureAdvice : fallbackAdvice, 
        courierId: Number(courierId),
        isDraft: isDraft !== undefined ? isDraft : fallbackIsDraft,
        estimatedReturnTime: estimatedReturnTime !== undefined ? estimatedReturnTime : fallbackReturnTime,
        isAccepted: fallbackIsAccepted 
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

    // 🔥 1. УМНАЯ ОТПРАВКА PUSH-УВЕДОМЛЕНИЙ КУРЬЕРУ
    let shouldSendPush = false;
    let isNewRoute = false;

    if (!oldRouteId || oldCourierId !== Number(courierId)) {
      shouldSendPush = true;
      isNewRoute = true;
    } else if (pointsChanged) {
      shouldSendPush = true;
      isNewRoute = false;
    }

    if (shouldSendPush && courierDb?.email) {
      const userObj = await prisma.user.findUnique({ where: { email: courierDb.email } });
      if (userObj) {
        if (isNewRoute) {
          await notify({
            type: "route.assigned",
            userId: userObj.id,
            routeId: newRoute.name,
            pointsCount: orderIds.length
          });
        } else {
          await notify({
            type: "custom",
            userId: userObj.id,
            title: `✏️ Маршрут ${newRoute.name} изменён`,
            body: `Точек: ${orderIds.length}. Проверьте обновлённый маршрут.`,
            url: "/courier/routes"
          });
        }
      }
    }

    // 🔥 2. ГЕНЕРАЦИЯ ПЛАШКИ И ПУША ДЛЯ МЕНЕДЖЕРА
    try {
      // Расширяем тип
      let changeType: 'ROUTE_REASSIGNED' | 'COURIER_CHANGED' | 'TIME_CHANGED' | 'ORDERS_CHANGED' | null = null;
      
      if (!oldRouteId) {
        changeType = 'ROUTE_REASSIGNED'; // Это абсолютно новый маршрут
      } else if (oldCourierId !== Number(courierId)) {
        changeType = 'COURIER_CHANGED';  // Маршрут старый, но курьера заменили
      } else if (plannedDepartureTime !== undefined && plannedDepartureTime !== fallbackPlannedTime) {
        changeType = 'TIME_CHANGED';     // Поменяли только время
      } else if (pointsChanged) {
        changeType = 'ORDERS_CHANGED';   // Перетасовали заказы
      }

      // Если было изменение и курьер существует, отправляем плашку
      if (changeType && courierDb) {
        await createManagerPlaque({
          courierId: String(courierDb.id),
          firstName: courierDb.firstName || '',
          lastName: courierDb.lastName || '',
          baseTime: newRoute.plannedDepartureTime || '—',
          oldTime: changeType === 'TIME_CHANGED' ? fallbackPlannedTime : null,
          changeType: changeType,
          authorName: authorName
        });
      }
    } catch (err) {
      console.error("[Manager Plaque Error]:", err);
    }

    return NextResponse.json({ success: true, routeId: newRoute.id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}