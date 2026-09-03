import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notify, createManagerPlaque } from "@/lib/notifications"; // 🔥 ДОБАВЛЕН ИМПОРТ ПЛАШКИ
import { updateCrmOrder } from "@/lib/crm";
import { getSession } from "@/lib/auth"; // 🔥 ДОБАВЛЕН ИМПОРТ СЕССИИ (чтобы знать, кто логист)

import { getCity } from "@/lib/cities";

// Константы координат больше нет: старт маршрута — база магазина заказов,
// а если она не заполнена — центр города этого магазина.

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
    let oldOrders: any[] = [];

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
      
      oldOrders = await prisma.order.findMany({
        where: { routeId: oldRouteId },
        select: { id: true, externalId: true, crmId: true, status: true }
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
            // 🔥 Статус вообще не трогаем, он остается тем, которым был
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
      select: { id: true, externalId: true, lat: true, lng: true, crmId: true, deliveryDate: true, crmCreatedAt: true, status: true, opComment: true, price: true, courierId: true, recipientPhone: true, shop: true, shopRef: { select: { storeLat: true, storeLng: true, city: true } } }
    });

    const sortedOrders = orderIds.map((id: string) => orders.find((o) => o.id === id)).filter(Boolean);
    const coordsList = sortedOrders.map((o: any) => o.lat && o.lng ? `${o.lat},${o.lng}` : null).filter(Boolean);
    
    const courierDb = await prisma.courier.findUnique({ where: { id: Number(courierId) } });
    const courierFullName = courierDb?.fullName || "";
    const rttMode = courierDb?.isAuto ? "auto" : "mt";

    // База магазина этих заказов; нет координат — центр его города
    const baseShop = (sortedOrders[0] as any)?.shopRef;
    const storeCoords =
      baseShop?.storeLat != null && baseShop?.storeLng != null
        ? `${baseShop.storeLat},${baseShop.storeLng}`
        : getCity(baseShop?.city).center.join(",");

    const rtextArr = [storeCoords, ...coordsList];
    if (returnToBase) rtextArr.push(storeCoords);
    
    const link = `https://yandex.ru/maps/?rtext=${rtextArr.join("~")}&rtt=${rttMode}`;

    // 🔥 1. СТРОГАЯ НОРМАЛИЗАЦИЯ ДАТЫ В ФОРМАТ YYYY-MM-DD
    let rawDate = routeDate;
    if (!rawDate && sortedOrders.length > 0) {
      const firstOrder = sortedOrders[0];
      rawDate = firstOrder?.deliveryDate || firstOrder?.crmCreatedAt;
    }

    let finalRouteDate = "";
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        finalRouteDate = d.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
      }
    }
    
    // Фолбек на сегодня, если дата битая
    if (!finalRouteDate || finalRouteDate.includes("Invalid")) {
      finalRouteDate = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }); 
    }
    
    // Отрезаем любые хвосты со временем, оставляем только чистый YYYY-MM-DD
    finalRouteDate = finalRouteDate.split('T')[0].split(' ')[0]; 

    let routeName = existingRouteName;
    if (!routeName) {
      const routeDay = finalRouteDate.split('-')[2];
      const prefix = `M-${routeDay}`;
      
      // 🔥 2. ИЩЕМ СТРОГО ПО НОРМАЛИЗОВАННОЙ ДАТЕ И ПРЕФИКСУ
      const routes = await prisma.route.findMany({
        where: { 
          date: finalRouteDate, // Ищем строго по "2026-06-25"
          name: { startsWith: prefix } 
        },
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
          // 🔥 Переводим в ASSIGNED ТОЛЬКО заказы со статусом NEW. Если он "В сборке", он там и остается.
          status: orderToUpdate.status === "NEW" ? "ASSIGNED" : undefined,
          opComment: newOpComment, price: finalPrice, 
          eta: orderEta 
        }
      });
      
      if (courierFullName && orderToUpdate?.crmId) {
        const finalPlannedTime = plannedDepartureTime !== undefined ? plannedDepartureTime : fallbackPlannedTime;
        await updateCrmOrder(orderToUpdate.crmId, { 
          courier: courierFullName,
          routeName: newRoute.name,
          returnTime: finalPlannedTime || undefined,   // 🔥 теперь это plannedDepartureTime, а не estimatedReturnTime
          routeDate: finalRouteDate,
          recipientPhone: orderToUpdate.recipientPhone || undefined,
        }).catch(() => {});
      }
    }

    // 🔥 1. УМНАЯ ОТПРАВКА PUSH-УВЕДОМЛЕНИЙ КУРЬЕРУ
    let shouldSendPush = false;
    let isNewRoute = false;
    let isTimeChangedOnly = false; // Добавляем флаг только для времени

    if (!oldRouteId || oldCourierId !== Number(courierId)) {
      shouldSendPush = true;
      isNewRoute = true;
    } else if (pointsChanged) {
      shouldSendPush = true;
      isNewRoute = false;
    } else if (plannedDepartureTime !== undefined && plannedDepartureTime !== fallbackPlannedTime) {
      // 🔥 ЕСЛИ ПОМЕНЯЛОСЬ ТОЛЬКО ВРЕМЯ
      shouldSendPush = true;
      isNewRoute = false;
      isTimeChangedOnly = true;
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
        } else if (isTimeChangedOnly) {
          // 🔥 ПУШ КУРЬЕРУ ПРО ИЗМЕНЕНИЕ ВРЕМЕНИ
          await notify({
            type: "custom",
            userId: userObj.id,
            title: `⏰ Изменено время выезда`,
            body: `Маршрут ${newRoute.name}. Новое время: ${plannedDepartureTime || "не указано"}`,
            url: "/courier/routes"
          });
        } else {
          // ПУШ КУРЬЕРУ ПРО ИЗМЕНЕНИЕ ТОЧЕК
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
      if (courierDb) {
        let oldLines: string[] = [];
        let newLines: string[] = [];
        let finalChangeType = 'MULTIPLE_CHANGES';

        if (!oldRouteId) {
          // НОВЫЙ МАРШРУТ
          finalChangeType = 'ROUTE_REASSIGNED';
          if (newRoute.plannedDepartureTime) {
             newLines.push(`⏱ ${newRoute.plannedDepartureTime}`);
          }
          newLines.push(`📦 Добавили: ${sortedOrders.map((o: any) => o.externalId || o.crmId || o.id).join(', ')}`);
        } else {
          // СУЩЕСТВУЮЩИЙ МАРШРУТ: Собираем только реальные изменения
          let changesCount = 0;

          if (oldCourierId !== Number(courierId)) {
            changesCount++;
            finalChangeType = 'COURIER_CHANGED';
            const oldCourierDb = oldCourierId ? await prisma.courier.findUnique({ where: { id: oldCourierId } }) : null;
            oldLines.push(`👤 ${oldCourierDb?.fullName || 'Без курьера'}`);
            newLines.push(`👤 ${courierDb.fullName || 'Без курьера'}`);
          }
          
          if (plannedDepartureTime !== undefined && plannedDepartureTime !== fallbackPlannedTime) {
            changesCount++;
            finalChangeType = 'TIME_CHANGED';
            oldLines.push(`⏱ ${fallbackPlannedTime || "—"}`);
            newLines.push(`⏱ ${plannedDepartureTime || "—"}`);
          }

          if (pointsChanged) {
            changesCount++;
            finalChangeType = 'ORDERS_CHANGED';
            const oldIds = oldOrders.map(o => String(o.externalId || o.crmId || o.id));
            const newIds = sortedOrders.map((o: any) => String(o.externalId || o.crmId || o.id));
            const added = newIds.filter((id: string) => !oldIds.includes(id));
            const removed = oldIds.filter((id: string) => !newIds.includes(id));
            
            oldLines.push(`📦 Состав изменён`);
            let diffs = [];
            if (added.length > 0) diffs.push(`➕ Добавили: ${added.join(', ')}`);
            if (removed.length > 0) diffs.push(`➖ Убрали: ${removed.join(', ')}`);
            newLines.push(diffs.join('\n'));
          }

          if (changesCount > 1) finalChangeType = 'MULTIPLE_CHANGES';

        }

        // 🔥 ОТПРАВЛЯЕМ ЧИСТУЮ ПЛАШКУ
        if (oldLines.length > 0 || newLines.length > 0 || finalChangeType === 'ROUTE_REASSIGNED') {
          await createManagerPlaque({
            courierId: courierDb.id,
            courierName: courierDb.fullName || 'Без курьера',
            routeName: newRoute.name, // 🔥 ПЕРЕДАЕМ МАРШРУТ СЮДА!
            newValue: newLines.join('\n'), 
            oldValue: oldLines.length > 0 ? oldLines.join('\n') : null, 
            changeType: finalChangeType,
            authorName: authorName
          }).catch(console.error);
        }
      }
    } catch (err) {
      console.error("[Manager Plaque Error]:", err);
    }

    return NextResponse.json({ success: true, routeId: newRoute.id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}