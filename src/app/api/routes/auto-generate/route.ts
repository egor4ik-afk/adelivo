// src/app/api/routes/auto-generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SLOTS } from "@/lib/constants"; // 🔥 Импортируем слоты для фильтрации

const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;

function getDist(lat1: number, lng1: number, lat2: number, lng2: number) {
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2));
}

export async function POST(req: Request) {
  try {
    const { routeDate, selectedSlots } = await req.json();
    if (!routeDate) return NextResponse.json({ error: "Не указана дата" }, { status: 400 });

    // 1. Правильные границы дня для Prisma DateTime (решает ошибку startsWith)
    const startOfDay = new Date(`${routeDate}T00:00:00.000Z`);
    const endOfDay = new Date(`${routeDate}T23:59:59.999Z`);

    // 2. Берем все новые заказы на день
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

    // 🔥 3. Фильтруем заказы по выбранным слотам (если они переданы с фронта)
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

    // 4. Берем курьеров на смене
    const activeCouriers = await prisma.courier.findMany({
      where: { isActive: true },
      include: { shifts: { where: { date: routeDate } } }
    });

    const availableCouriers = activeCouriers.filter(c => c.shifts.length > 0);
    if (availableCouriers.length === 0) return NextResponse.json({ error: "Нет курьеров на смене" }, { status: 400 });

    const autoCouriers = availableCouriers.filter(c => c.isAuto);
    const walkCouriers = availableCouriers.filter(c => !c.isAuto);

    let routesCreated = 0;
    let ordersAssigned = 0;
    const routeDay = routeDate.split('-')[2];
    const prefix = `AI-${routeDay}-`;

    // 🔥 Храним количество маршрутов у каждого курьера, чтобы не давать больше 5 в день
    const courierRouteCount: Record<number, number> = {};
    availableCouriers.forEach(c => courierRouteCount[c.id] = 0);

    const createDraftRoute = async (courier: any, routeOrders: any[]) => {
      if (routeOrders.length === 0) return;

      const routeName = `${prefix}${courier.id}-${Math.floor(Math.random() * 1000)}`;
      const link = `https://yandex.ru/maps/?rtext=${STORE_LAT},${STORE_LNG}~${routeOrders.map(o => `${o.lat},${o.lng}`).join("~")}&rtt=${courier.isAuto ? 'auto' : 'mt'}`;

      const newRoute = await prisma.route.create({
        data: { 
          name: routeName, 
          link, 
          date: routeDate, 
          courierId: courier.id,
          isDraft: true // 🔥 Жестко помечаем как черновик
        }
      });

      for (let i = 0; i < routeOrders.length; i++) {
        await prisma.order.update({
          where: { id: routeOrders[i].id },
          data: { 
            courierId: courier.id, courier: courier.fullName,
            routeId: newRoute.id, routeOrder: i + 1,
            status: "ASSIGNED" 
          }
        });
      }
      routesCreated++;
      ordersAssigned += routeOrders.length;
      courierRouteCount[courier.id]++; // Увеличиваем счетчик ходок
    };

    // 🔥 5. Группируем заказы по времени (slotFrom), чтобы курьер не ездил по маршруту, 
    // где одна точка на 10 утра, а другая на 18 вечера.
    const groupedOrders: Record<string, typeof targetOrders> = {};
    targetOrders.forEach(o => {
      const key = o.slotFrom || "00:00";
      if (!groupedOrders[key]) groupedOrders[key] = [];
      groupedOrders[key].push(o);
    });

    const sortedSlots = Object.keys(groupedOrders).sort();

    // 6. Распределяем по слотам по очереди
    for (const slotKey of sortedSlots) {
      let unassignedInSlot = groupedOrders[slotKey];

      let progress = true; // Флаг, смогли ли мы раздать заказы в этом проходе
      
      // Пока в слоте есть точки и мы можем их кому-то отдать
      while (unassignedInSlot.length > 0 && progress) {
        progress = false;

        // --- РАЗДАЧА АВТО КУРЬЕРАМ ---
        for (const courier of autoCouriers) {
          if (unassignedInSlot.length === 0) break;
          if (courierRouteCount[courier.id] >= 5) continue; // 🔥 Лимит 5 маршрутов в день

          const maxPoints = Math.floor(Math.random() * 4) + 5; // От 5 до 8
          const clusterSize = Math.min(maxPoints, unassignedInSlot.length); // Если точек меньше, забираем остаток
          
          const anchor = unassignedInSlot[0];
          unassignedInSlot.sort((a, b) => getDist(anchor.lat!, anchor.lng!, a.lat!, a.lng!) - getDist(anchor.lat!, anchor.lng!, b.lat!, b.lng!));
          
          const routeOrders = unassignedInSlot.splice(0, clusterSize);
          await createDraftRoute(courier, routeOrders);
          progress = true; // Движение есть, крутим цикл дальше
        }

        // --- РАЗДАЧА ПЕШИМ КУРЬЕРАМ ---
        for (const courier of walkCouriers) {
          if (unassignedInSlot.length === 0) break;
          if (courierRouteCount[courier.id] >= 5) continue; // 🔥 Лимит 5 маршрутов в день

          const clusterSize = Math.min(3, unassignedInSlot.length); // Максимум 3, если 2 — заберет 2
          
          const anchor = unassignedInSlot[0];
          unassignedInSlot.sort((a, b) => getDist(anchor.lat!, anchor.lng!, a.lat!, a.lng!) - getDist(anchor.lat!, anchor.lng!, b.lat!, b.lng!));
          
          const routeOrders = unassignedInSlot.splice(0, clusterSize);
          await createDraftRoute(courier, routeOrders);
          progress = true;
        }
      }
    }

    // Считаем, сколько точек не влезло ни в один лимит
    let leftOver = 0;
    sortedSlots.forEach(k => leftOver += groupedOrders[k].length);

    return NextResponse.json({ success: true, routesCreated, ordersAssigned, leftOver });

  } catch (e: any) {
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
}