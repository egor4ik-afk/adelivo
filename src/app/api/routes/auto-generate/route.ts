// src/app/api/routes/auto-generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SLOTS } from "@/lib/constants";
import OpenAI from "openai";

// 🔥 Игнорируем заглушку, если она случайно подтянулась из переменных окружения
const rawFolderId = process.env.YANDEX_CATALOG_ID;
const YANDEX_CLOUD_FOLDER = (!rawFolderId || rawFolderId.includes("stub")) 
  ? "b1gcr5m4ptniag2qpsqm" 
  : rawFolderId;

const YANDEX_CLOUD_API_KEY = process.env.YANDEX_LLM_API_KEY;
const YANDEX_CLOUD_MODEL = "aliceai-llm/latest"; // или "yandexgpt/latest"
// 🔥 КЛЮЧ ДЛЯ МАТРИЦЫ РАССТОЯНИЙ
const YANDEX_ROUTING_KEY = process.env.YANDEX_ROUTING_KEY; 

const client = new OpenAI({
  apiKey: YANDEX_CLOUD_API_KEY,
  baseURL: "https://ai.api.cloud.yandex.net/v1",
  defaultHeaders: {
    "OpenAI-Project": YANDEX_CLOUD_FOLDER,
  },
});

const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

async function getDistanceMatrix(points: { id: string, lat: number, lng: number }[], mode: 'auto' | 'transit') {
  if (!YANDEX_ROUTING_KEY) {
      console.warn("Нет ключа YANDEX_ROUTING_KEY, возвращаем заглушку (по прямой)");
      return null;
  }
  try {
      // 🔥 ВАЖНОЕ ИСПРАВЛЕНИЕ: Яндекс требует формат "долгота,широта" (lng,lat)
      const origins = points.map(p => `${p.lng},${p.lat}`).join('|');
      const destinations = origins;
      const res = await fetch(`https://api.routing.yandex.net/v2/distancematrix?apikey=${YANDEX_ROUTING_KEY}&origins=${origins}&destinations=${destinations}&mode=${mode}`);
      if (!res.ok) return null;
      return await res.json();
  } catch (e) {
      console.error("Ошибка получения матрицы:", e);
      return null;
  }
}

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
    // Безопасное извлечение тела запроса
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

    const pointsForMatrix = [{ id: "STORE", lat: STORE_LAT, lng: STORE_LNG }, ...targetOrders.map(o => ({ id: o.id, lat: o.lat!, lng: o.lng! }))];
    const distanceMatrix = await getDistanceMatrix(pointsForMatrix, 'transit'); 

    const promptOrders = targetOrders.map(o => ({
        id: o.id,
        address: o.address, 
        slot: `${o.slotFrom}-${o.slotTo}`,
        items: o.items,
        comment: o.comment,
        lat: o.lat, lng: o.lng
    }));

    const promptCouriers = availableCouriers.map(c => ({
        id: c.id,
        type: c.isAuto ? "auto" : "walking",
        rating: c.priority || 3,
    }));

    const systemPrompt = `Ты — продвинутый AI-логист. Твоя задача — разбить заказы на компактные маршруты для курьеров.
    
    КРИТИЧЕСКИЕ ПРАВИЛА СОЗДАНИЯ МАРШРУТОВ:
    1. ОБЪЕМ: Для пешего курьера (walking) создавай маршруты СТРОГО по 3-4 точек! Для авто (auto) — по 5-7 точек. Не перегружай пеших!
    2. ПРИОРИТЕТ ГРУЗА: Анализируй поле 'items' и 'comment'. 
       - Если это быстро увядающие цветы (например: розы, тюльпаны, букеты без аквабокса) или тяжелый/объемный заказ (много позиций), помечай этот заказ как "HIGH" приоритет.
       - Остальное (стойкие цветы в аквабоксах, мелкие подарки, если долго хранятся) — "NORMAL".
    3. ГЕОГРАФИЯ: Собирай точки в ОДНОМ районе (кластере). Используй координаты (lat, lng), чтобы точки в одном массиве были близко друг к другу.
    4. Если заказов много, ОДНОМУ курьеру можно создать НЕСКОЛЬКО маршрутов (массивов orderIds), но каждый массив должен быть небольшим (3-5 точек для пешего).
    
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
              { role: "user", content: `Матрица расстояний (минуты): ${JSON.stringify(distanceMatrix?.rows?.map((r:any) => r.elements.map((e:any)=> Math.round(e.duration.value/60))) || "Недоступна")}\nЗаказы: ${JSON.stringify(promptOrders)}\nКурьеры: ${JSON.stringify(promptCouriers)}` }
            ],
            temperature: 0.1, 
        });

        let content = response.choices[0]?.message?.content?.trim() || "[]";
        
        // 🔥 ПУЛЕНЕПРОБИВАЕМЫЙ ПАРСИНГ: Ищем массив внутри любого текста
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

             // Оптимизируем внутри микро-маршрута с учетом High Priority
             const optimizedRoute = optimizeCluster(validOrders, STORE_LAT, STORE_LNG);

             const routeName = `${prefix}${courier.id}-${Math.floor(Math.random() * 1000)}`;
             // Для ссылок Яндекс.Карт формат lat,lng правильный
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

    // Подсчитываем сколько точек ИИ оставил без внимания
    const leftOverOrders = targetOrders.filter(o => !assignedSet.has(o.id));

    return NextResponse.json({ success: true, routesCreated, ordersAssigned, leftOver: leftOverOrders.length });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error("Общая ошибка auto-generate:", e);
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
}