// src/app/api/routes/auto-generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SLOTS } from "@/lib/constants";
import OpenAI from "openai";

// === НАСТРОЙКИ AI (Yandex Cloud) ===
const YANDEX_CLOUD_FOLDER = process.env.YANDEX_CATALOG_ID || "b1gcr5m4ptniag2qpsqm";
const YANDEX_CLOUD_API_KEY = process.env.YANDEX_LLM_API_KEY;
const YANDEX_CLOUD_MODEL = "aliceai-llm/latest";

const client = new OpenAI({
  apiKey: YANDEX_CLOUD_API_KEY,
  baseURL: "https://ai.api.cloud.yandex.net/v1",
  defaultHeaders: {
    "OpenAI-Project": YANDEX_CLOUD_FOLDER,
  },
});

const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;

// Вспомогательная функция для расчета расстояния
function getDist(lat1: number, lng1: number, lat2: number, lng2: number) {
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2));
}

// 🔥 Локальная оптимизация (Упорядочивает точки внутри кластера)
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

export async function POST(req: Request) {
  try {
    const { routeDate, selectedSlots } = await req.json();
    if (!routeDate) return NextResponse.json({ error: "Не указана дата" }, { status: 400 });

    const startOfDay = new Date(`${routeDate}T00:00:00.000Z`);
    const endOfDay = new Date(`${routeDate}T23:59:59.999Z`);

    // 1. Получаем все нераспределенные заказы
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

    // 2. Получаем активных курьеров
    const activeCouriers = await prisma.courier.findMany({
      where: { isActive: true },
      include: { shifts: { where: { date: routeDate } } }
    });

    let availableCouriers = activeCouriers.filter(c => c.shifts.length > 0);
    if (availableCouriers.length === 0) return NextResponse.json({ error: "Нет курьеров на смене" }, { status: 400 });

    // 🔥 ПРАВИЛО: Если точек меньше 15, отключаем АВТО курьеров
    if (targetOrders.length < 15) {
        availableCouriers = availableCouriers.filter(c => !c.isAuto);
    }

    // 🔥 Сортируем курьеров по рейтингу (чтобы AI отдавал предпочтение лучшим)
    availableCouriers.sort((a, b) => (b.priority || 3) - (a.priority || 3));

    if (availableCouriers.length === 0) return NextResponse.json({ error: "Курьеры не подошли под критерии (например, остались только авто, а заказов < 15)" }, { status: 400 });

    // ============================================================================
    // 🧠 БЛОК ИСКУССТВЕННОГО ИНТЕЛЛЕКТА (Сборка оптимальных маршрутов)
    // ============================================================================
    
    const promptOrders = targetOrders.map(o => ({
        id: o.id,
        address: o.address, 
        slot: `${o.slotFrom}-${o.slotTo}`,
        lat: o.lat, lng: o.lng
    }));

    const promptCouriers = availableCouriers.map(c => ({
        id: c.id,
        type: c.isAuto ? "auto" : "walking",
        rating: c.priority || 3,
        shift: `${c.shifts[0].startTime}-${c.shifts[0].endTime}`
    }));

    // 🔥 УСИЛЕННЫЙ ПРОМПТ
    const systemPrompt = `Ты главный логистический AI-диспетчер. Твоя задача — сгруппировать заказы в маршруты и назначить их на курьеров.
    КРИТИЧЕСКИЕ ПРАВИЛА:
    1. РАСПРЕДЕЛИ ВСЕ ЗАКАЗЫ до единого. Ни один id из списка заказов не должен остаться без курьера.
    2. РАВНОМЕРНОСТЬ: Максимально задействуй всех доступных курьеров. Не отдавай все заказы одному курьеру, если есть другие свободные.
    3. ОДИН КУРЬЕР = ОДИН МАРШРУТ (строго один объект в JSON). Собери все заказы для одного курьера в единый массив orderIds. Категорически запрещено дублировать один и тот же courierId в разных объектах JSON.
    4. ВМЕСТИМОСТЬ: пеший (walking) берет до 6-7 заказов за раз, авто (auto) до 10-15 заказов. 
    5. ЛОГИКА: Группируй заказы по близости адресов (address) и временным слотам (slot).
    
    ВЕРНИ СТРОГО JSON-МАССИВ. Пример ответа:
    [
      { "courierId": 123, "orderIds": ["uuid-1", "uuid-2", "uuid-3"] },
      { "courierId": 456, "orderIds": ["uuid-4", "uuid-5"] }
    ]`;

    let aiParsedData: { courierId: number, orderIds: string[] }[] = [];

    try {
        const response = await client.chat.completions.create({
            model: `gpt://${YANDEX_CLOUD_FOLDER}/${YANDEX_CLOUD_MODEL}`,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Заказы: ${JSON.stringify(promptOrders)}\nКурьеры: ${JSON.stringify(promptCouriers)}` }
            ],
            temperature: 0.1, 
        });

        let content = response.choices[0]?.message?.content?.trim() || "[]";
        if (content.startsWith("```")) {
            content = content.replace(/^```json/g, "").replace(/^```/g, "").replace(/```$/g, "").trim();
        }

        aiParsedData = JSON.parse(content);
        if (!Array.isArray(aiParsedData)) throw new Error("AI вернул не массив");
    } catch (e) {
        console.error("Ошибка AI распределения:", e);
        return NextResponse.json({ error: "Не удалось сгенерировать маршруты через AI. Попробуйте снова." }, { status: 500 });
    }

    // ============================================================================
    // 🛡 ЗАЩИТА ОТ ОШИБОК AI (Слияние дублей и спасение "потеряшек")
    // ============================================================================
    
    // 1. Принудительно склеиваем дубли, если AI всё-таки создал 2 маршрута одному курьеру
    const mergedAssignments: Record<number, string[]> = {};
    for (const routeAssignment of aiParsedData) {
        const { courierId, orderIds } = routeAssignment;
        const courierExists = availableCouriers.some(c => c.id === courierId);
        
        if (!courierExists || !orderIds || orderIds.length === 0) continue;
        
        if (!mergedAssignments[courierId]) {
            mergedAssignments[courierId] = [];
        }
        
        for (const id of orderIds) {
            if (targetOrders.some(o => o.id === id) && !mergedAssignments[courierId].includes(id)) {
                mergedAssignments[courierId].push(id);
            }
        }
    }

    // 2. Спасатель "потерянных" заказов
    const assignedOrderIds = new Set(Object.values(mergedAssignments).flat());
    const leftOverOrders = targetOrders.filter(o => !assignedOrderIds.has(o.id));

    if (leftOverOrders.length > 0 && Object.keys(mergedAssignments).length > 0) {
        // Если AI забыл заказы, мы принудительно отдаем их в географически ближайший готовый маршрут
        for (const lostOrder of leftOverOrders) {
            let bestCourierId: number | null = null;
            let minDistance = Infinity;

            for (const [cId, oIds] of Object.entries(mergedAssignments)) {
                for (const oId of oIds) {
                    const existingOrder = targetOrders.find(o => o.id === oId);
                    if (existingOrder && existingOrder.lat && existingOrder.lng && lostOrder.lat && lostOrder.lng) {
                        const dist = getDist(lostOrder.lat, lostOrder.lng, existingOrder.lat, existingOrder.lng);
                        if (dist < minDistance) {
                            minDistance = dist;
                            bestCourierId = Number(cId);
                        }
                    }
                }
            }
            
            if (bestCourierId) {
                mergedAssignments[bestCourierId].push(lostOrder.id);
            }
        }
    } else if (leftOverOrders.length > 0 && availableCouriers.length > 0) {
        // Если AI упал или вернул пустоту, отдаем фоллбэком лучшему курьеру
        mergedAssignments[availableCouriers[0].id] = leftOverOrders.map(o => o.id);
    }

    // ============================================================================
    // 🚚 ПРИМЕНЕНИЕ МАРШРУТОВ ОТ AI К БАЗЕ ДАННЫХ
    // ============================================================================

    let routesCreated = 0;
    let ordersAssigned = 0;
    const routeDay = routeDate.split('-')[2];
    const prefix = `AI-${routeDay}-`;

    for (const [courierIdStr, orderIds] of Object.entries(mergedAssignments)) {
        const courierId = Number(courierIdStr);
        const courier = availableCouriers.find(c => c.id === courierId);
        if (!courier || orderIds.length === 0) continue;

        const routeOrders = orderIds.map(id => targetOrders.find(o => o.id === id)).filter(Boolean) as typeof targetOrders;
        if (routeOrders.length === 0) continue;

        // 🔥 ПРОГОНЯЕМ ЧЕРЕЗ АЛГОРИТМ БЛИЖАЙШЕГО СОСЕДА: 
        // AI собрал классный кластер, мы выстраиваем внутри него идеальную очередь!
        const optimizedRoute = optimizeCluster(routeOrders, STORE_LAT, STORE_LNG);

        const routeName = `${prefix}${courier.id}-${Math.floor(Math.random() * 1000)}`;
        const link = `https://yandex.ru/maps/?rtext=${STORE_LAT},${STORE_LNG}~${optimizedRoute.map(o => `${o.lat},${o.lng}`).join("~")}&rtt=${courier.isAuto ? 'auto' : 'mt'}`;

        const newRoute = await prisma.route.create({
            data: { name: routeName, link, date: routeDate, courierId: courier.id, isDraft: true }
        });

        for (let i = 0; i < optimizedRoute.length; i++) {
            await prisma.order.update({
                where: { id: optimizedRoute[i].id },
                data: { 
                    courierId: courier.id, 
                    courier: courier.fullName, 
                    routeId: newRoute.id, 
                    routeOrder: i + 1, 
                    status: "ASSIGNED" 
                }
            });
        }
        
        routesCreated++;
        ordersAssigned += optimizedRoute.length;
    }

    const leftOver = targetOrders.length - ordersAssigned;

    return NextResponse.json({ success: true, routesCreated, ordersAssigned, leftOver });

  } catch (e: any) {
    console.error("Общая ошибка auto-generate:", e);
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
}