// src/app/api/routes/auto-generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SLOTS } from "@/lib/constants";
import OpenAI from "openai";

const YANDEX_CLOUD_FOLDER = process.env.YANDEX_CLOUD_FOLDER;
const YANDEX_CLOUD_API_KEY = process.env.YANDEX_LLM_API_KEY;
const YANDEX_CLOUD_MODEL = "aliceai-llm/latest"; // или "yandexgpt/latest"

const client = new OpenAI({
  apiKey: YANDEX_CLOUD_API_KEY,
  baseURL: "https://ai.api.cloud.yandex.net/v1",
  defaultHeaders: {
    "OpenAI-Project": YANDEX_CLOUD_FOLDER,
  },
});

const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;

// Центральные координаты Москвы (Кремль) для расчета удаленности
const MOSCOW_CENTER_LAT = 55.7558;
const MOSCOW_CENTER_LNG = 37.6173;

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Функция расчета расстояния в километрах (Формула гаверсинуса)
function getDistanceFromCenterKm(lat: number, lng: number): number {
  const R = 6371; // Радиус Земли в км
  const dLat = (lat - MOSCOW_CENTER_LAT) * (Math.PI / 180);
  const dLon = (lng - MOSCOW_CENTER_LNG) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(MOSCOW_CENTER_LAT * (Math.PI / 180)) * Math.cos(lat * (Math.PI / 180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

// Определение зоны по удаленности от центра
function getMoscowZone(distanceKm: number): string {
  if (distanceKm <= 5.5) return "Внутри ТТК";
  if (distanceKm <= 16.5) return "Между ТТК и МКАД";
  return "За МКАДом";
}

// Расчет расстояния по прямой между двумя точками
function getDist(lat1: number, lng1: number, lat2: number, lng2: number) {
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function optimizeCluster(points: any[], startLat: number, startLng: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted: any[] = [];
  const remaining = [...points];
  let curLat = startLat;
  let curLng = startLng;

  const highPriority = remaining.filter(p => p.aiPriority === "HIGH");
  const normalPriority = remaining.filter(p => p.aiPriority !== "HIGH");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildRoute = (pool: any[]) => {
      while(pool.length > 0) {
          pool.sort((a,b) => getDist(curLat, curLng, a.lat!, a.lng!) - getDist(curLat, curLng, b.lat!, b.lng!));
          const next = pool.shift();
          sorted.push(next);
          curLat = next.lat!; curLng = next.lng!;
      }
  };

  buildRoute(highPriority);
  buildRoute(normalPriority);

  return sorted;
}

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "Ошибка чтения данных запроса" }, { status: 400 });
    }

    const { routeDate, selectedSlots } = body;
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
        if (!o.slotFrom) return selectedSlots.includes("Другие");
        const exact = SLOTS.find(s => s.from === o.slotFrom && s.to === o.slotTo);
        if (exact) return selectedSlots.includes(exact.label);
        const match = SLOTS.find(s => o.slotFrom! > s.from && o.slotFrom! <= s.to);
        if (match) return selectedSlots.includes(match.label);
        return selectedSlots.includes("Другие");
      });
    }

    if (targetOrders.length === 0) return NextResponse.json({ error: "В выбранных слотах нет свободных заказов" }, { status: 400 });

    const activeCouriers = await prisma.courier.findMany({
      where: { isActive: true },
      include: { shifts: { where: { date: routeDate } } }
    });

    let availableCouriers = activeCouriers.filter(c => c.shifts.length > 0);
    if (availableCouriers.length === 0) return NextResponse.json({ error: "Нет курьеров на смене" }, { status: 400 });

    if (targetOrders.length < 15) {
        availableCouriers = availableCouriers.filter(c => !c.isAuto);
    }
    availableCouriers.sort((a, b) => (b.priority || 3) - (a.priority || 3));
    if (availableCouriers.length === 0) return NextResponse.json({ error: "Курьеры не подошли под критерии" }, { status: 400 });

    // 🔥 ОБОГАЩАЕМ ЗАКАЗЫ ЗОНАМИ ДЛЯ НЕЙРОСЕТИ
    const promptOrders = targetOrders.map(o => {
        const distKm = getDistanceFromCenterKm(o.lat!, o.lng!);
        return {
            id: o.id,
            address: o.address, 
            slot: `${o.slotFrom}-${o.slotTo}`,
            items: o.items,
            comment: o.comment,
            lat: o.lat, 
            lng: o.lng,
            distanceFromCenterKm: Math.round(distKm * 10) / 10,
            zone: getMoscowZone(distKm) // Внутри ТТК, Между ТТК и МКАД, За МКАДом
        };
    });

    const promptCouriers = availableCouriers.map(c => ({
        id: c.id,
        type: c.isAuto ? "auto" : "walking",
        rating: c.priority || 3,
    }));

    const systemPrompt = `Ты — продвинутый AI-логист. Твоя задача — разбить заказы на компактные маршруты для курьеров.
    
    КРИТИЧЕСКИЕ ПРАВИЛА СОЗДАНИЯ МАРШРУТОВ:
    
    1. ПРАВИЛА ДЛЯ ПЕШЕГО КУРЬЕРА (walking):
       - ОБЪЕМ: Строго от 2 до 4 заказов на маршруте.
       - СЛОТЫ ДОСТАВКИ: Не более 2 разных периодов доставки (слотов) в одном маршруте.
       - ГЕОГРАФИЯ (ВАЖНО!): Выбирай для пеших курьеров заказы с пометкой zone: "Внутри ТТК". Они имеют абсолютный приоритет.
    
    2. ПРАВИЛА ДЛЯ АВТО-КУРЬЕРА (auto):
       - ОБЪЕМ: Строго от 5 до 10 заказов на маршруте.
       - СЛОТЫ ДОСТАВКИ: Не более 2 разных периодов доставки (слотов) в одном маршруте.
       - ГЕОГРАФИЯ (ВАЖНО!): Нужно давать авто-курьерам заказы за пределами ТТК. Чем дальше от центра (distanceFromCenterKm) — тем лучше. НАИВЫСШИЙ ПРИОРИТЕТ отдавай заказам с пометкой zone: "За МКАДом".
    
    3. ОБЩАЯ ЛОГИКА И ПРИОРИТЕТЫ:
       - ГРУППИРОВКА: Собирай точки в ОДНОМ районе (кластере), чтобы минимизировать время в пути (используй координаты lat/lng). Маршрут должен занимать около 3 часов в одну сторону.
       - ПРИОРИТЕТ ГРУЗА: Анализируй поле 'items' и 'comment'. Быстро увядающие цветы (например: розы, тюльпаны, букеты без аквабокса) или тяжелый/объемный заказ помечай как "HIGH" приоритет. Остальное — "NORMAL".
       - МУЛЬТИ-МАРШРУТЫ: ОДНОМУ курьеру можно создать НЕСКОЛЬКО маршрутов (массивов orderIds), но каждый массив должен подчиняться правилам объема выше.
    
    Каждый заказ в списке имеет параметры 'zone' и 'distanceFromCenterKm'. Обязательно используй их для правильного распределения между 'walking' и 'auto' курьерами!
    
    Формат ответа СТРОГО JSON:
    [
      { 
        "courierId": 123, 
        "routes": [
          {
            "orderIds": ["uuid-1", "uuid-2"],
            "priorities": { "uuid-1": "HIGH", "uuid-2": "NORMAL" }
          }
        ]
      }
    ]`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let aiParsedData: any[] = [];
    try {
        const response = await client.chat.completions.create({
            model: `gpt://${YANDEX_CLOUD_FOLDER}/${YANDEX_CLOUD_MODEL}`,
            messages: [
              { role: "system", content: systemPrompt },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              { role: "user", content: `Заказы: ${JSON.stringify(promptOrders)}\nКурьеры: ${JSON.stringify(promptCouriers)}` }
            ],
            temperature: 0.1, 
        });

        let content = response.choices[0]?.message?.content?.trim() || "[]";
        
        const startIdx = content.indexOf('[');
        const endIdx = content.lastIndexOf(']');
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            content = content.substring(startIdx, endIdx + 1);
        } else {
            throw new Error("AI не вернул валидный JSON массив");
        }

        aiParsedData = JSON.parse(content);
    } catch (e) {
        console.error("Ошибка AI (Yandex LLM):", e);
        return NextResponse.json({ error: "AI не справился с расчетом" }, { status: 500 });
    }

    let routesCreated = 0;
    let ordersAssigned = 0;
    const routeDay = routeDate.split('-')[2];
    const prefix = `AI-${routeDay}-`;

    const assignedSet = new Set<string>();

    // Применение маршрутов
    for (const assignment of aiParsedData) {
        const courierId = Number(assignment.courierId);
        const courier = availableCouriers.find(c => c.id === courierId);
        if (!courier || !assignment.routes) continue;

        for (const routeCluster of assignment.routes) {
             const orderIds = routeCluster.orderIds || [];
             const priorities = routeCluster.priorities || {};

             const validOrders = orderIds
                .map((id:string) => targetOrders.find(o => o.id === id && !assignedSet.has(o.id)))
                .filter(Boolean);
                
             if (validOrders.length === 0) continue;

             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             validOrders.forEach((o:any) => { 
                 o.aiPriority = priorities[o.id] || "NORMAL"; 
                 assignedSet.add(o.id); 
             });

             const optimizedRoute = optimizeCluster(validOrders, STORE_LAT, STORE_LNG);
             const routeName = `${prefix}${courier.id}-${Math.floor(Math.random() * 1000)}`;
             const link = `https://yandex.ru/maps/?rtext=${STORE_LAT},${STORE_LNG}~${optimizedRoute.map(o => `${o.lat},${o.lng}`).join("~")}&rtt=${courier.isAuto ? 'auto' : 'mt'}`;

             const newRoute = await prisma.route.create({
              data: { 
                 name: routeName, 
                 link, 
                 date: routeDate, 
                 courierId: courier.id, 
                 isDraft: true,
                 estimatedReturnTime: null 
              }
          });

             for (let i = 0; i < optimizedRoute.length; i++) {
                 await prisma.order.update({
                     where: { id: optimizedRoute[i].id },
                     data: { courierId: courier.id, courier: courier.fullName, routeId: newRoute.id, routeOrder: i + 1, status: "ASSIGNED" }
                 });
             }
             routesCreated++;
             ordersAssigned += optimizedRoute.length;
        }
    }

    const leftOverOrders = targetOrders.filter(o => !assignedSet.has(o.id));
    return NextResponse.json({ success: true, routesCreated, ordersAssigned, leftOver: leftOverOrders.length });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("Общая ошибка auto-generate:", e);
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
}