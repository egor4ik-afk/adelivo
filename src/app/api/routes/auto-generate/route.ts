// src/app/api/routes/auto-generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SLOTS } from "@/lib/constants";

const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;

function getDist(lat1: number, lng1: number, lat2: number, lng2: number) {
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2));
}

// 🔥 Алгоритм Ближайшего Соседа (Оптимизация маршрута внутри AI)
function optimizeCluster(points: any[], startLat: number, startLng: number) {
  const sorted = [];
  const remaining = [...points];
  let curLat = startLat;
  let curLng = startLng;
  while(remaining.length > 0) {
     remaining.sort((a,b) => getDist(curLat, curLng, a.lat!, a.lng!) - getDist(curLat, curLng, b.lat!, b.lng!));
     const next = remaining.shift();
     sorted.push(next);
     curLat = next.lat!; curLng = next.lng!;
  }
  return sorted;
}

function isOrderInShift(order: any, shift: any) {
  if (!order.slotFrom || !shift.startTime || !shift.endTime) return true; 
  return order.slotFrom >= shift.startTime && order.slotFrom <= shift.endTime;
}

export async function POST(req: Request) {
  try {
    const { routeDate, selectedSlots } = await req.json();
    if (!routeDate) return NextResponse.json({ error: "Не указана дата" }, { status: 400 });

    const startOfDay = new Date(`${routeDate}T00:00:00.000Z`);
    const endOfDay = new Date(`${routeDate}T23:59:59.999Z`);

    const orders = await prisma.order.findMany({
      where: { 
        status: "NEW", 
        courierId: null,
        lat: { not: null },
        lng: { not: null },
        OR: [
          { deliveryDate: routeDate },
          { deliveryDate: null, crmCreatedAt: { gte: startOfDay, lte: endOfDay } }
        ]
      }
    });

    if (orders.length === 0) return NextResponse.json({ error: "Нет свободных заказов" }, { status: 400 });

    let targetOrders = orders;
    if (selectedSlots && selectedSlots.length > 0) {
      targetOrders = orders.filter(o => {
        if (!o.slotFrom) return false;
        const exact = SLOTS.find(s => s.from === o.slotFrom && s.to === o.slotTo);
        if (exact) return selectedSlots.includes(exact.label);
        const match = SLOTS.find(s => o.slotFrom! > s.from && o.slotFrom! <= s.to);
        return match ? selectedSlots.includes(match.label) : false;
      });
    }

    if (targetOrders.length === 0) return NextResponse.json({ error: "В выбранных слотах нет свободных заказов" }, { status: 400 });

    const activeCouriers = await prisma.courier.findMany({
      where: { isActive: true },
      include: { shifts: { where: { date: routeDate } } }
    });

    const availableCouriers = activeCouriers.filter(c => c.shifts.length > 0);
    if (availableCouriers.length === 0) return NextResponse.json({ error: "Нет курьеров на смене" }, { status: 400 });

    let routesCreated = 0;
    let ordersAssigned = 0;
    const routeDay = routeDate.split('-')[2];
    const prefix = `AI-${routeDay}-`;

    const courierRouteCount: Record<number, number> = {};
    availableCouriers.forEach(c => courierRouteCount[c.id] = 0);

    const createDraftRoute = async (courier: any, routeOrders: any[]) => {
      if (routeOrders.length === 0) return;
      const routeName = `${prefix}${courier.id}-${Math.floor(Math.random() * 1000)}`;
      const link = `https://yandex.ru/maps/?rtext=${STORE_LAT},${STORE_LNG}~${routeOrders.map(o => `${o.lat},${o.lng}`).join("~")}&rtt=${courier.isAuto ? 'auto' : 'mt'}`;

      const newRoute = await prisma.route.create({
        data: { name: routeName, link, date: routeDate, courierId: courier.id, isDraft: true }
      });

      for (let i = 0; i < routeOrders.length; i++) {
        await prisma.order.update({
          where: { id: routeOrders[i].id },
          data: { courierId: courier.id, courier: courier.fullName, routeId: newRoute.id, routeOrder: i + 1, status: "ASSIGNED" }
        });
      }
      routesCreated++;
      ordersAssigned += routeOrders.length;
      courierRouteCount[courier.id]++;
    };

    const groupedOrders: Record<string, typeof targetOrders> = {};
    targetOrders.forEach(o => {
      const key = o.slotFrom || "00:00";
      if (!groupedOrders[key]) groupedOrders[key] = [];
      groupedOrders[key].push(o);
    });

    const sortedSlots = Object.keys(groupedOrders).sort();

    // 🔥 РАСПРЕДЕЛЕНИЕ
    for (const slotKey of sortedSlots) {
      let unassignedInSlot = groupedOrders[slotKey];
      let progress = true;
      
      while (unassignedInSlot.length > 0 && progress) {
        progress = false;

        // 🔥 1. Сортируем: Сначала по ПРИОРИТЕТУ КУРЬЕРА (от 5 к 1), а при равном — у кого меньше ходок
        availableCouriers.sort((a,b) => {
            const priorityA = a.priority || 3;
            const priorityB = b.priority || 3;
            if (priorityA !== priorityB) return priorityB - priorityA; // Высокий приоритет забирает заказы первым
            return courierRouteCount[a.id] - courierRouteCount[b.id];  // Балансировка между курьерами одного уровня
        });

        for (const courier of availableCouriers) {
          if (courierRouteCount[courier.id] >= 5) continue; // Лимит ходок
          if (unassignedInSlot.length === 0) break;

          const shift = courier.shifts[0];
          
          // Выбираем только те точки из слота, которые вписываются в часы работы курьера
          const mainSlotOrders = unassignedInSlot.filter(o => isOrderInShift(o, shift));
          if (mainSlotOrders.length === 0) continue;

          // 🔥 2. Динамическая вместимость: 5-звездочный пеший может взять 4 точки
          const courierPriority = courier.priority || 3;
          let maxPoints = 3; // Дефолт для пешего
          if (courier.isAuto) {
            maxPoints = Math.floor(Math.random() * 4) + 5; // 5-8 для авто
          } else if (courierPriority === 5) {
            maxPoints = 4; // Топовый пеший
          }

          const clusterSize = Math.min(maxPoints, mainSlotOrders.length);
          
          // 🔥 3. Логика "Домой в конце смены"
          // Если слот начинается менее чем за 3 часа до конца смены курьера — это "конец дня"
          const shiftEndH = parseInt(shift.endTime?.split(":")[0] || "22", 10);
          const slotStartH = parseInt(slotKey.split(":")[0] || "00", 10);
          const isLateShift = slotStartH >= (shiftEndH - 3);

          if (isLateShift && courier.homeLat && courier.homeLng) {
             // Ищем точку, ближайшую к ДОМУ курьера
             mainSlotOrders.sort((a,b) => getDist(courier.homeLat!, courier.homeLng!, a.lat!, a.lng!) - getDist(courier.homeLat!, courier.homeLng!, b.lat!, b.lng!));
          } else {
             // Ищем точку, ближайшую к БАЗЕ
             mainSlotOrders.sort((a,b) => getDist(STORE_LAT, STORE_LNG, a.lat!, a.lng!) - getDist(STORE_LAT, STORE_LNG, b.lat!, b.lng!));
          }
          const anchor = mainSlotOrders[0];
          
          // Сортируем остальные относительно якоря
          mainSlotOrders.sort((a, b) => getDist(anchor.lat!, anchor.lng!, a.lat!, a.lng!) - getDist(anchor.lat!, anchor.lng!, b.lat!, b.lng!));
          const routeOrders = mainSlotOrders.slice(0, clusterSize);

          // Убираем их из общего пула
          const routeOrderIds = new Set(routeOrders.map(x => x.id));
          unassignedInSlot = unassignedInSlot.filter(x => !routeOrderIds.has(x.id));

          // 🔥 ДОКИДЫВАЕМ 1 ТОЧКУ ИЗ СЛЕДУЮЩЕГО СЛОТА (если есть место)
          if (routeOrders.length < maxPoints) {
             const nextSlotKey = sortedSlots[sortedSlots.indexOf(slotKey) + 1];
             if (nextSlotKey && groupedOrders[nextSlotKey]) {
                 const nextSlotOrders = groupedOrders[nextSlotKey].filter(o => isOrderInShift(o, shift));
                 if (nextSlotOrders.length > 0) {
                     // Ищем ближайшую к последней точке нашего кластера
                     const lastPoint = routeOrders[routeOrders.length - 1];
                     nextSlotOrders.sort((a,b) => getDist(lastPoint.lat!, lastPoint.lng!, a.lat!, a.lng!) - getDist(lastPoint.lat!, lastPoint.lng!, b.lat!, b.lng!));
                     const extraOrder = nextSlotOrders[0];
                     routeOrders.push(extraOrder);
                     // Вырезаем её
                     groupedOrders[nextSlotKey] = groupedOrders[nextSlotKey].filter(x => x.id !== extraOrder.id);
                 }
             }
          }

          // ОПТИМИЗИРУЕМ МАРШРУТ перед сохранением
          const optimizedRoute = optimizeCluster(routeOrders, STORE_LAT, STORE_LNG);

          await createDraftRoute(courier, optimizedRoute);
          progress = true; // Сделали шаг, крутим цикл дальше
        }
      }
      groupedOrders[slotKey] = unassignedInSlot; // Возвращаем остатки
    }

    let leftOver = 0;
    sortedSlots.forEach(k => leftOver += groupedOrders[k].length);

    return NextResponse.json({ success: true, routesCreated, ordersAssigned, leftOver });

  } catch (e: any) {
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
}