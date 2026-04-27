// src/app/api/routes/auto-generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SLOTS } from "@/lib/constants";
import OpenAI from "openai";

// ─── LLM: DeepSeek V4 Pro через opencode.ai (primary) ───
const GO_API_KEY = process.env.GO_API_KEY; // ключ opencode.ai
const goClient = new OpenAI({
  apiKey: GO_API_KEY,
  baseURL: "https://opencode.ai/zen/go/v1",
});

// ─── Яндекс Distance Matrix ───────────────────────────────
const YANDEX_ROUTING_KEY = process.env.YANDEX_ROUTING_KEY;

// ─── Конфиг ───────────────────────────────────────────────
const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;

const MAX_ORDERS_WALKING  = 4;
const MAX_ORDERS_AUTO     = 7;
const MIN_ORDERS_FOR_AUTO = 15;
const AVG_SPEED_WALK_KMH  = 5;
const AVG_SPEED_AUTO_KMH  = 25;
const STOP_TIME_WALK_MIN  = 8;
const STOP_TIME_AUTO_MIN  = 5;
const RETURN_BUFFER_MIN   = 20;

// ─────────────────────────────────────────────────────────
//  ТИПЫ
// ─────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  lat: number;
  lng: number;
  slotFrom: string | null;
  slotTo: string | null;
  items: string | null;
  comment: string | null;
  address: string | null;
  priority: "HIGH" | "NORMAL";
};

type CourierRow = {
  id: number;
  fullName: string;
  isAuto: boolean;
  priority: number | null;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: Date | null;
  homeLat: number | null;
  homeLng: number | null;
};

type LLMAssignment = {
  courierId: number;
  clusterIndexes: number[];
  priorities: Record<string, "HIGH" | "NORMAL">;
};

// ─────────────────────────────────────────────────────────
//  ГЕОМЕТРИЯ
// ─────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function travelMin(lat1: number, lng1: number, lat2: number, lng2: number, isAuto: boolean) {
  return (haversineKm(lat1, lng1, lat2, lng2) / (isAuto ? AVG_SPEED_AUTO_KMH : AVG_SPEED_WALK_KMH)) * 60;
}

function euclidean(lat1: number, lng1: number, lat2: number, lng2: number) {
  return Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);
}

// ─────────────────────────────────────────────────────────
//  ЯНДЕКС DISTANCE MATRIX
// ─────────────────────────────────────────────────────────

async function getDistanceMatrix(
  points: { id: string; lat: number; lng: number }[],
  isAuto: boolean
): Promise<number[][] | null> {
  if (!YANDEX_ROUTING_KEY) return null;
  try {
    const coords = points.map((p) => `${p.lat},${p.lng}`).join("|");
    const mode = isAuto ? "auto" : "transit";
    const res = await fetch(
      `https://api.routing.yandex.net/v2/distancematrix?apikey=${YANDEX_ROUTING_KEY}&origins=${coords}&destinations=${coords}&mode=${mode}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.rows ?? []).map((row: any) =>
      (row.elements ?? []).map((el: any) =>
        el.status === "OK" ? el.duration.value / 60 : null
      )
    );
  } catch (e) {
    console.warn("[matrix] Яндекс недоступен, fallback haversine:", e);
    return null;
  }
}

function getDuration(
  matrix: number[][] | null,
  fromIdx: number, toIdx: number,
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  isAuto: boolean
): number {
  const val = matrix?.[fromIdx]?.[toIdx];
  if (val != null && val > 0) return val;
  return travelMin(fromLat, fromLng, toLat, toLng, isAuto);
}

// ─────────────────────────────────────────────────────────
//  ПРИОРИТЕТ ЗАКАЗА
// ─────────────────────────────────────────────────────────

const HIGH_KEYWORDS = [
  "роза", "розы", "тюльпан", "тюльпаны", "букет",
  "срочно", "fragile", "хрупко", "живые цветы",
];

function detectPriority(items: string | null, comment: string | null): "HIGH" | "NORMAL" {
  const text = `${items ?? ""} ${comment ?? ""}`.toLowerCase();
  return HIGH_KEYWORDS.some((kw) => text.includes(kw)) ? "HIGH" : "NORMAL";
}

// ─────────────────────────────────────────────────────────
//  СТАРТОВАЯ ТОЧКА КУРЬЕРА
// ─────────────────────────────────────────────────────────

function courierStart(
  courier: CourierRow,
  clusterLat: number,
  clusterLng: number
): { lat: number; lng: number } {
  // Текущая геолокация если свежее 30 мин
  if (courier.lat && courier.lng && courier.locationUpdatedAt) {
    const ageMin = (Date.now() - courier.locationUpdatedAt.getTime()) / 60000;
    if (ageMin < 30) return { lat: courier.lat, lng: courier.lng };
  }
  // Дом если ближе к кластеру чем магазин
  if (courier.homeLat && courier.homeLng) {
    const dHome  = euclidean(courier.homeLat, courier.homeLng, clusterLat, clusterLng);
    const dStore = euclidean(STORE_LAT, STORE_LNG, clusterLat, clusterLng);
    if (dHome < dStore) return { lat: courier.homeLat, lng: courier.homeLng };
  }
  return { lat: STORE_LAT, lng: STORE_LNG };
}

// ─────────────────────────────────────────────────────────
//  TSP: NEAREST-NEIGHBOUR + 2-OPT
// ─────────────────────────────────────────────────────────

function routeCost(
  route: OrderRow[], sLat: number, sLng: number,
  matrix: number[][] | null, idxMap: Map<string, number>,
  sIdx: number, isAuto: boolean
): number {
  let cost = 0, pLat = sLat, pLng = sLng, pIdx = sIdx;
  for (const o of route) {
    const tIdx = idxMap.get(o.id)!;
    cost += getDuration(matrix, pIdx, tIdx, pLat, pLng, o.lat, o.lng, isAuto);
    pLat = o.lat; pLng = o.lng; pIdx = tIdx;
  }
  return cost;
}

function tspOptimize(
  orders: OrderRow[], sLat: number, sLng: number,
  matrix: number[][] | null, idxMap: Map<string, number>,
  sIdx: number, isAuto: boolean
): OrderRow[] {
  // Nearest-neighbour
  const rem = [...orders];
  const route: OrderRow[] = [];
  let pLat = sLat, pLng = sLng, pIdx = sIdx;
  while (rem.length > 0) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < rem.length; i++) {
      const d = getDuration(matrix, pIdx, idxMap.get(rem[i].id)!, pLat, pLng, rem[i].lat, rem[i].lng, isAuto);
      if (d < bd) { bd = d; bi = i; }
    }
    const next = rem.splice(bi, 1)[0];
    route.push(next);
    pLat = next.lat; pLng = next.lng; pIdx = idxMap.get(next.id)!;
  }
  // 2-opt improvement
  if (route.length <= 3) return route;
  let best = [...route], improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 2; j < best.length; j++) {
        const cand = [...best];
        let l = i + 1, r = j;
        while (l < r) { [cand[l], cand[r]] = [cand[r], cand[l]]; l++; r--; }
        if (routeCost(cand, sLat, sLng, matrix, idxMap, sIdx, isAuto) <
            routeCost(best, sLat, sLng, matrix, idxMap, sIdx, isAuto)) {
          best = cand; improved = true;
        }
      }
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────
//  КЛАСТЕРИЗАЦИЯ (жадный NN, HIGH-заказы в приоритете)
// ─────────────────────────────────────────────────────────

function clusterOrders(orders: OrderRow[], maxSize: number): OrderRow[][] {
  const rem = [...orders].sort((a, b) => {
    if (a.priority === "HIGH" && b.priority !== "HIGH") return -1;
    if (b.priority === "HIGH" && a.priority !== "HIGH") return 1;
    return euclidean(a.lat, a.lng, STORE_LAT, STORE_LNG) - euclidean(b.lat, b.lng, STORE_LAT, STORE_LNG);
  });

  const clusters: OrderRow[][] = [];
  while (rem.length > 0) {
    const seed = rem.shift()!;
    const cluster: OrderRow[] = [seed];
    let cLat = seed.lat, cLng = seed.lng;

    while (cluster.length < maxSize && rem.length > 0) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < rem.length; i++) {
        const d = euclidean(rem[i].lat, rem[i].lng, cLat, cLng);
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi < 0) break;
      cluster.push(rem.splice(bi, 1)[0]);
      cLat = cluster.reduce((s, o) => s + o.lat, 0) / cluster.length;
      cLng = cluster.reduce((s, o) => s + o.lng, 0) / cluster.length;
    }
    clusters.push(cluster);
  }
  return clusters;
}

// ─────────────────────────────────────────────────────────
//  ОЦЕНКА ВРЕМЕНИ
// ─────────────────────────────────────────────────────────

function estimateTime(
  route: OrderRow[], sLat: number, sLng: number,
  matrix: number[][] | null, idxMap: Map<string, number>,
  sIdx: number, isAuto: boolean
): { routeMin: number; returnMin: number } {
  const stopTime = isAuto ? STOP_TIME_AUTO_MIN : STOP_TIME_WALK_MIN;
  let total = 0, pLat = sLat, pLng = sLng, pIdx = sIdx;

  for (const o of route) {
    const tIdx = idxMap.get(o.id)!;
    total += getDuration(matrix, pIdx, tIdx, pLat, pLng, o.lat, o.lng, isAuto) + stopTime;
    pLat = o.lat; pLng = o.lng; pIdx = tIdx;
  }

  const storeIdx = idxMap.get("__store__") ?? 0;
  const returnMin = getDuration(matrix, pIdx, storeIdx, pLat, pLng, STORE_LAT, STORE_LNG, isAuto);

  return { routeMin: Math.round(total), returnMin: Math.round(returnMin) };
}

// ─────────────────────────────────────────────────────────
//  LLM: DeepSeek V4 Pro — распределяет кластеры по курьерам
// ─────────────────────────────────────────────────────────

// src/app/api/routes/auto-generate/route.ts (Замени функцию assignClustersWithLLM)

async function assignClustersWithLLM(
  clusters: OrderRow[][],
  couriers: CourierRow[]
): Promise<LLMAssignment[] | null> {
  if (!GO_API_KEY) return null;

  try {
    const clusterDigest = clusters.map((cl, i) => ({
      index: i,
      count: cl.length,
      centerLat: +(cl.reduce((s, o) => s + o.lat, 0) / cl.length).toFixed(5),
      centerLng: +(cl.reduce((s, o) => s + o.lng, 0) / cl.length).toFixed(5),
      hasHigh: cl.some((o) => o.priority === "HIGH"),
      slots: [...new Set(cl.map((o) => `${o.slotFrom}-${o.slotTo}`))],
      orders: cl.map((o) => ({ id: o.id, priority: o.priority, slot: `${o.slotFrom}-${o.slotTo}`, items: o.items?.slice(0, 60) })),
    }));

    const courierDigest = couriers.map((c) => ({
      id: c.id,
      type: c.isAuto ? "auto" : "walking",
      rating: c.priority ?? 3,
      hasLiveLocation: !!(c.lat && c.lng && c.locationUpdatedAt && (Date.now() - c.locationUpdatedAt.getTime()) / 60000 < 30),
    }));

    const clusterDists = clusters.map((clA, i) => {
      const aLat = clA.reduce((s, o) => s + o.lat, 0) / clA.length;
      const aLng = clA.reduce((s, o) => s + o.lng, 0) / clA.length;
      return clusters.map((clB) => {
        const bLat = clB.reduce((s, o) => s + o.lat, 0) / clB.length;
        const bLng = clB.reduce((s, o) => s + o.lng, 0) / clB.length;
        return +haversineKm(aLat, aLng, bLat, bLng).toFixed(2);
      });
    });

    const systemPrompt = `Ты — экспертный логист. Распредели кластеры заказов по курьерам оптимально.

ПРАВИЛА:
1. walking-курьер: не более 2 кластеров за смену (3-4 заказа каждый)
2. auto-курьер: не более 3 кластеров за смену (5-7 заказов каждый)
3. HIGH-приоритет (розы, срочно, хрупкое) — курьерам с высоким рейтингом
4. Географически близкие кластеры (малое расстояние) — одному курьеру
5. Сначала заполняй рейтинговых курьеров
6. Укажи priority для каждого order id

Ответ СТРОГО JSON без markdown:
[{"courierId":1,"clusterIndexes":[0,2],"priorities":{"order-id":"HIGH"}}]`;

const response = await goClient.chat.completions.create({
  // 🔥 Используем формат из доки Open Code
  model: "deepseek-v4-pro", // 🔥 Возвращаем оригинальное имя без префикса
  //   response_format: { type: "json_object" }, // Принудительно требуем JSON
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Кластеры: ${JSON.stringify(clusterDigest)}\nКурьеры: ${JSON.stringify(courierDigest)}\nРасстояния км: ${JSON.stringify(clusterDists)}` },
  ],
  temperature: 0.1,
  max_tokens: 4000,
});

const rawContent = response.choices[0]?.message?.content;

// Выводим полный ответ, если пришла пустота
if (!rawContent) {
  console.error("[LLM] Пустой ответ от OpenCode API! Полный ответ сервера:", JSON.stringify(response, null, 2));
  return null;
}

let content = rawContent.trim();
content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

try {
  const parsed: LLMAssignment[] = JSON.parse(content);
  
  // Автокоррекция, если модель вложила массив в объект (например, {"data": [...]})
  if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
     const possibleArray = Object.values(parsed).find(Array.isArray);
     if (possibleArray) return possibleArray as LLMAssignment[];
  }
  
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  return parsed;
} catch (parseError) {
  // Теперь мы точно увидим, КАКОЙ текст сломал парсер
  console.error("[LLM] Ошибка парсинга JSON! Сырой ответ от модели:", content);
  return null;
}

  } catch (e) {
    console.error("[LLM] DeepSeek общая ошибка запроса:", e);
    return null;
  }
}
// ─────────────────────────────────────────────────────────
//  FALLBACK: алгоритмическое распределение
// ─────────────────────────────────────────────────────────

function assignClustersAlgo(clusters: OrderRow[][], couriers: CourierRow[]): LLMAssignment[] {
  const result: LLMAssignment[] = [];
  const usedClusters = new Set<number>();

  for (const courier of couriers) {
    if (usedClusters.size >= clusters.length) break;
    const maxClusters = courier.isAuto ? 3 : 2;
    const clusterIndexes: number[] = [];
    const priorities: Record<string, "HIGH" | "NORMAL"> = {};

    for (let i = 0; i < clusters.length && clusterIndexes.length < maxClusters; i++) {
      if (!usedClusters.has(i)) {
        clusterIndexes.push(i);
        usedClusters.add(i);
        for (const o of clusters[i]) priorities[o.id] = o.priority;
      }
    }

    if (clusterIndexes.length > 0) result.push({ courierId: courier.id, clusterIndexes, priorities });
  }

  return result;
}

// ─────────────────────────────────────────────────────────
//  ЗАПИСЬ МАРШРУТА В БД
// ─────────────────────────────────────────────────────────

async function saveRoute(
  orders: OrderRow[], courier: CourierRow,
  routeDate: string, prefix: string,
  matrix: number[][] | null, idxMap: Map<string, number>,
  startLat: number, startLng: number
): Promise<number> {
  if (orders.length === 0) return 0;

  const storeIdx = idxMap.get("__store__") ?? 0;
  const optimized = tspOptimize(orders, startLat, startLng, matrix, idxMap, storeIdx, courier.isAuto);
  const { routeMin, returnMin } = estimateTime(optimized, startLat, startLng, matrix, idxMap, storeIdx, courier.isAuto);

  const waypoints = [`${startLat},${startLng}`, ...optimized.map((o) => `${o.lat},${o.lng}`)].join("~");
  const link = `https://yandex.ru/maps/?rtext=${waypoints}&rtt=${courier.isAuto ? "auto" : "mt"}`;
  const name = `${prefix}${courier.id}-${Math.floor(Math.random() * 9000) + 1000}`;

  const newRoute = await prisma.route.create({
    data: {
      name,
      link,
      date: routeDate,
      courierId: courier.id,
      isDraft: true,
      departureAdvice: `~${routeMin} мин в пути, возврат ~${returnMin} мин`,
    },
  });

  for (let i = 0; i < optimized.length; i++) {
    try {
      await prisma.order.update({
        where: { id: optimized[i].id },
        data: {
          courierId: courier.id,
          courier: courier.fullName,
          routeId: newRoute.id,
          routeOrder: i + 1,
          status: "ASSIGNED",
        },
      });
    } catch (e) {
      console.error(`[saveRoute] order ${optimized[i].id}:`, e);
    }
  }

  return optimized.length;
}

// ─────────────────────────────────────────────────────────
//  MAIN HANDLER
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
//  НОРМАЛИЗАЦИЯ СЛОТОВ
//  Принимаем любой формат от фронта:
//    "12:00-14:00"  "12-14"  "с 12:00 до 14:00"  или label из SLOTS
//  Возвращаем Set строк вида "12:00-14:00"
// ─────────────────────────────────────────────────────────

function normalizeSlots(raw: string[]): Set<string> {
  const result = new Set<string>();
  for (const s of raw) {
    // Уже в формате "12:00-14:00"
    const direct = s.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (direct) { result.add(s); continue; }

    // Формат "12-14" → "12:00-14:00"
    const short = s.match(/^(\d{1,2})-(\d{1,2})$/);
    if (short) { result.add(`${short[1].padStart(2,"0")}:00-${short[2].padStart(2,"0")}:00`); continue; }

    // Формат "с 12:00 до 14:00"
    const ru = s.match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);
    if (ru) { result.add(`${ru[1]}-${ru[2]}`); continue; }

    // Label из SLOTS ("12-14 пешком" и т.п.) → ищем в константах
    const slotMatch = SLOTS.find((sl) => sl.label === s);
    if (slotMatch) { result.add(`${slotMatch.from}-${slotMatch.to}`); continue; }

    // Оставляем как есть (для "Другие" и кастомных)
    result.add(s);
  }
  return result;
}

// Проверяет попадает ли заказ в переданный набор слотов
function orderMatchesSlots(
  o: { slotFrom: string | null; slotTo: string | null },
  slotSet: Set<string>
): boolean {
  if (!o.slotFrom || !o.slotTo) return slotSet.has("Другие");
  // Точное совпадение "HH:MM-HH:MM"
  if (slotSet.has(`${o.slotFrom}-${o.slotTo}`)) return true;
  // Через SLOTS.label
  const slot = SLOTS.find((s) => s.from === o.slotFrom && s.to === o.slotTo);
  if (slot && slotSet.has(slot.label)) return true;
  return false;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const routeDate: string | undefined = body.routeDate;
    // selectedSlots — массив временных диапазонов: ["12:00-14:00", "18:00-20:00"]
    // Если не передан или пустой — распределяем ВСЕ свободные заказы на дату
    const rawSlots: string[] = body.selectedSlots ?? [];

    if (!routeDate)
      return NextResponse.json({ error: "Не указана дата (routeDate)" }, { status: 400 });

    const slotSet = normalizeSlots(rawSlots); // пустой Set = все слоты
    const filterBySlots = slotSet.size > 0;

    const startOfDay = new Date(`${routeDate}T00:00:00.000Z`);
    const endOfDay   = new Date(`${routeDate}T23:59:59.999Z`);

    // ─── 1. Только NEW + без курьера + с координатами ─────
    //  Delivered / Assigned / InDelivery — не трогаем никогда
    const orders = await prisma.order.findMany({
      where: {
        status: "NEW",        // ← только новые
        courierId: null,      // ← ещё не назначены
        lat: { not: null },
        lng: { not: null },
        OR: [
          { deliveryDate: routeDate },
          { deliveryDate: null, crmCreatedAt: { gte: startOfDay, lte: endOfDay } },
        ],
      },
    });

    if (orders.length === 0)
      return NextResponse.json({ error: "Нет свободных заказов на эту дату" }, { status: 400 });

    // ─── 2. Фильтруем по выбранным слотам ─────────────────
    const targetOrders = filterBySlots
      ? orders.filter((o) => orderMatchesSlots(o, slotSet))
      : orders;

    if (targetOrders.length === 0) {
      // Подсказываем какие слоты вообще есть
      const availableSlots = [
        ...new Set(
          orders.map((o) =>
            o.slotFrom && o.slotTo ? `${o.slotFrom}-${o.slotTo}` : "Другие"
          )
        ),
      ].sort();
      return NextResponse.json({
        error: "В выбранных слотах нет свободных заказов",
        requestedSlots: [...slotSet],
        availableSlots,
      }, { status: 400 });
    }

    // Собираем статистику по слотам для ответа
    const slotStats: Record<string, number> = {};
    for (const o of targetOrders) {
      const key = o.slotFrom && o.slotTo ? `${o.slotFrom}-${o.slotTo}` : "Другие";
      slotStats[key] = (slotStats[key] ?? 0) + 1;
    }

    // 3. Курьеры на смене
    const activeCouriers = await prisma.courier.findMany({
      where: { isActive: true },
      include: { shifts: { where: { date: routeDate } } },
    });
    let availableCouriers = activeCouriers.filter((c) => c.shifts.length > 0);
    if (availableCouriers.length === 0)
      return NextResponse.json({ error: "Нет курьеров на смене" }, { status: 400 });

    if (targetOrders.length < MIN_ORDERS_FOR_AUTO) {
      const walking = availableCouriers.filter((c) => !c.isAuto);
      if (walking.length > 0) availableCouriers = walking;
    }
    availableCouriers.sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3));

    // 4. Обогащаем приоритетами
    const enriched: OrderRow[] = targetOrders.map((o) => ({
      id: o.id, lat: o.lat!, lng: o.lng!,
      slotFrom: o.slotFrom, slotTo: o.slotTo,
      items: o.items, comment: o.comment, address: o.address,
      priority: detectPriority(o.items, o.comment),
    }));

    // 5. Яндекс Distance Matrix
    const hasAuto = availableCouriers.some((c) => c.isAuto);
    const matrixPoints = [
      { id: "__store__", lat: STORE_LAT, lng: STORE_LNG },
      ...enriched.map((o) => ({ id: o.id, lat: o.lat, lng: o.lng })),
    ];
    const matrix = await getDistanceMatrix(matrixPoints, hasAuto).catch(() => null);
    const idxMap = new Map<string, number>();
    matrixPoints.forEach((p, i) => idxMap.set(p.id, i));

    // 6. Кластеризация
    const maxClusterSize = hasAuto ? MAX_ORDERS_AUTO : MAX_ORDERS_WALKING;
    const clusters = clusterOrders(enriched, maxClusterSize);

    // 7. Распределение: DeepSeek V4 Pro → fallback алгоритм
    const couriersForAssign: CourierRow[] = availableCouriers.map((c) => ({
      id: c.id, fullName: c.fullName, isAuto: c.isAuto, priority: c.priority,
      lat: c.lat, lng: c.lng, locationUpdatedAt: c.locationUpdatedAt,
      homeLat: c.homeLat, homeLng: c.homeLng,
    }));

    let assignments = await assignClustersWithLLM(clusters, couriersForAssign);
    const usedFallback = !assignments;
    if (!assignments) {
      console.warn("[auto-generate] LLM недоступен, используем алгоритм");
      assignments = assignClustersAlgo(clusters, couriersForAssign);
    }

    // 8. Записываем в БД
    const assignedSet = new Set<string>();
    let routesCreated = 0;
    let ordersAssigned = 0;
    const prefix = `AI-${routeDate.split("-")[2]}-`;

    for (const assignment of assignments) {
      try {
        const courier = couriersForAssign.find((c) => c.id === assignment.courierId);
        if (!courier) continue;

        let isFirstRoute = true;
        let timeBudget = 480; // 8 часов в минутах

        for (const clIdx of assignment.clusterIndexes) {
          try {
            const cluster = clusters[clIdx];
            if (!cluster) continue;

            const available = cluster
              .filter((o) => !assignedSet.has(o.id))
              .slice(0, courier.isAuto ? MAX_ORDERS_AUTO : MAX_ORDERS_WALKING)
              .map((o) => ({ ...o, priority: (assignment.priorities[o.id] ?? o.priority) as "HIGH" | "NORMAL" }));

            if (available.length === 0) continue;

            const clLat = available.reduce((s, o) => s + o.lat, 0) / available.length;
            const clLng = available.reduce((s, o) => s + o.lng, 0) / available.length;
            const start = isFirstRoute ? courierStart(courier, clLat, clLng) : { lat: STORE_LAT, lng: STORE_LNG };

            // Проверяем бюджет времени
            const storeIdx = idxMap.get("__store__") ?? 0;
            const preview = tspOptimize(available, start.lat, start.lng, matrix, idxMap, storeIdx, courier.isAuto);
            const { routeMin, returnMin } = estimateTime(preview, start.lat, start.lng, matrix, idxMap, storeIdx, courier.isAuto);
            const totalNeeded = routeMin + returnMin + RETURN_BUFFER_MIN;

            if (totalNeeded > timeBudget) {
              console.warn(`[auto-generate] курьер ${courier.id}: нужно ${totalNeeded} мин, осталось ${timeBudget}`);
              continue;
            }

            const saved = await saveRoute(available, courier, routeDate, prefix, matrix, idxMap, start.lat, start.lng);
            for (const o of available) assignedSet.add(o.id);

            routesCreated++;
            ordersAssigned += saved;
            timeBudget -= totalNeeded;
            isFirstRoute = false;
          } catch (e) {
            console.error("[auto-generate] ошибка кластера:", e);
          }
        }
      } catch (e) {
        console.error("[auto-generate] ошибка assignment:", e);
      }
    }

    const leftOver = enriched.filter((o) => !assignedSet.has(o.id)).length;

    return NextResponse.json({
      success: true,
      routesCreated,
      ordersAssigned,
      leftOver,
      usedFallback,
      processedSlots: filterBySlots ? [...slotSet] : ["все"],
      slotBreakdown: slotStats,
      // Сколько NEW-заказов на эту дату осталось нетронутыми (другие слоты)
      untouchedNewOrders: orders.length - targetOrders.length,
    });
  } catch (e: any) {
    console.error("[auto-generate] общая ошибка:", e);
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}