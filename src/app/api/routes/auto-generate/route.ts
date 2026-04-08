// src/app/api/routes/auto-generate/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SLOTS } from "@/lib/constants";
import OpenAI from "openai";

// ─── Yandex LLM ──────────────────────────────────────────────────────────────
const YANDEX_CLOUD_FOLDER = process.env.YANDEX_CATALOG_ID || "b1gcr5m4ptniag2qpsqm";
const YANDEX_CLOUD_API_KEY = process.env.YANDEX_LLM_API_KEY;
const YANDEX_CLOUD_MODEL   = "aliceai-llm/latest";

const client = new OpenAI({
  apiKey: YANDEX_CLOUD_API_KEY,
  baseURL: "https://ai.api.cloud.yandex.net/v1",
  defaultHeaders: { "OpenAI-Project": YANDEX_CLOUD_FOLDER },
});

// ─── База ────────────────────────────────────────────────────────────────────
const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;

// ─── Лимиты ──────────────────────────────────────────────────────────────────
const LIMITS = {
  walking: { maxPointsPerRoute: 4, maxRoutesPerDay: 4, maxPointsPerDay: 20, maxRouteRadiusHours: 4 },
  auto:    { maxPointsPerRoute: 7, maxRoutesPerDay: 4, maxPointsPerDay: 20 },
};

// ─── Ключевые слова «маленьких» заказов (только пешим) ───────────────────────
const SMALL_ORDER_KEYWORDS = [
  "луковиц", "гвоздик", "тюльпан", "нарцисс", "ирис", "зелень",
  "листья", "лист ", "веточк", "эвкалипт", "1 букет", "открытк",
  "конфет", "шар", "мягк", "игрушк",
];

// ─── Ключевые слова «тяжёлых» / HIGH-приоритет заказов ───────────────────────
const HEAVY_KEYWORDS = [
  "роз", "пион", "орхидея", "корзин", "коробк", "композиц",
  "51", "101", "201", "большой", "крупный",
];

// ═════════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═════════════════════════════════════════════════════════════════════════════

/** Евклидово расстояние (градусы — достаточно для сортировки) */
function dist(lat1: number, lng1: number, lat2: number, lng2: number) {
  return Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2);
}

/** Время слота → минуты от полуночи */
function slotToMin(t: string | null | undefined, fallback = 1439) {
  if (!t) return fallback;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Классификация одного заказа */
function classifyOrder(order: any): { isMeura: boolean; isSmall: boolean; isHeavy: boolean } {
  const shop  = (order.shop || "").toLowerCase();
  const items = (order.items || "").toLowerCase();

  const isMeura = shop === "kaktusfiori" || shop === "meura-flowers";
  const isSmall = !isMeura && SMALL_ORDER_KEYWORDS.some(k => items.includes(k));
  const isHeavy = HEAVY_KEYWORDS.some(k => items.includes(k));

  return { isMeura, isSmall, isHeavy };
}

/**
 * Оптимизация маршрута: ближайший сосед с учётом слотов,
 * с финальным «разворотом» в сторону домашнего адреса курьера.
 */
function optimizeCluster(
  points: any[],
  startLat: number,
  startLng: number,
  homeLat?: number | null,
  homeLng?: number | null
): any[] {
  if (points.length === 0) return [];
  if (points.length === 1) return points;

  const sorted: any[] = [];
  const remaining = [...points];
  let curLat = startLat;
  let curLng = startLng;

  while (remaining.length > 0) {
    // Взвешенная оценка: сначала слот, потом расстояние
    remaining.sort((a, b) => {
      const slotDiff = slotToMin(a.slotFrom) - slotToMin(b.slotFrom);
      if (Math.abs(slotDiff) > 30) return slotDiff; // разница > 30 мин — слот важнее
      return dist(curLat, curLng, a.lat, a.lng) - dist(curLat, curLng, b.lat, b.lng);
    });
    const next = remaining.shift()!;
    sorted.push(next);
    curLat = next.lat;
    curLng = next.lng;
  }

  // Если знаем дом курьера — пробуем переставить последние точки,
  // чтобы финальная точка была ближе к дому
  if (homeLat && homeLng && sorted.length >= 3) {
    // Ищем среди последних 3 точек ту, что ближе к дому
    const tail = sorted.slice(-3);
    let bestIdx = sorted.length - 1;
    let bestHomeDist = dist(sorted[bestIdx].lat, sorted[bestIdx].lng, homeLat, homeLng);

    for (let i = sorted.length - 3; i < sorted.length; i++) {
      const d = dist(sorted[i].lat, sorted[i].lng, homeLat, homeLng);
      if (d < bestHomeDist) {
        bestHomeDist = d;
        bestIdx = i;
      }
    }
    // Переносим найденную точку в конец
    if (bestIdx !== sorted.length - 1) {
      const [moved] = sorted.splice(bestIdx, 1);
      sorted.push(moved);
    }
  }

  return sorted;
}

/**
 * Группировка заказов по временным слотам.
 * Возвращает массив групп — каждая группа ≈ один маршрут.
 * maxPerCluster — максимум точек в кластере.
 */
function clusterBySlot(orders: any[], maxPerCluster: number): any[][] {
  // Сортируем по slotFrom
  const sorted = [...orders].sort((a, b) => slotToMin(a.slotFrom) - slotToMin(b.slotFrom));

  const clusters: any[][] = [];
  let current: any[] = [];

  for (const order of sorted) {
    if (current.length === 0) {
      current.push(order);
      continue;
    }

    const firstSlot = slotToMin(current[0].slotFrom);
    const thisSlot  = slotToMin(order.slotFrom);

    // Если слот отличается > 2.5 часов ИЛИ кластер заполнен — новый кластер
    const slotGap = thisSlot - firstSlot;
    if (slotGap > 150 || current.length >= maxPerCluster) {
      clusters.push(current);
      current = [order];
    } else {
      current.push(order);
    }
  }
  if (current.length > 0) clusters.push(current);

  return clusters;
}

/**
 * Географическая кластеризация (K-means-lite, 1 итерация).
 * Делит точки на N географических кластеров.
 */
function geoSplit(orders: any[], n: number): any[][] {
  if (n <= 1 || orders.length <= n) return orders.map(o => [o]);

  // Инициализируем центроиды равномерно по отсортированному списку
  const sorted = [...orders].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const step = Math.floor(sorted.length / n);
  const centroids = Array.from({ length: n }, (_, i) => ({
    lat: sorted[Math.min(i * step, sorted.length - 1)].lat,
    lng: sorted[Math.min(i * step, sorted.length - 1)].lng,
  }));

  const clusters: any[][] = Array.from({ length: n }, () => []);
  for (const order of orders) {
    let bestC = 0;
    let bestD = Infinity;
    centroids.forEach((c, i) => {
      const d = dist(order.lat, order.lng, c.lat, c.lng);
      if (d < bestD) { bestD = d; bestC = i; }
    });
    clusters[bestC].push(order);
  }
  return clusters.filter(c => c.length > 0);
}

// ═════════════════════════════════════════════════════════════════════════════
// ГЛАВНЫЙ ОБРАБОТЧИК
// ═════════════════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  try {
    const { routeDate, selectedSlots } = await req.json();
    if (!routeDate) return NextResponse.json({ error: "Не указана дата" }, { status: 400 });

    const startOfDay = new Date(`${routeDate}T00:00:00.000Z`);
    const endOfDay   = new Date(`${routeDate}T23:59:59.999Z`);

    // ── Загружаем заказы ──────────────────────────────────────────────────────
    const allOrders = await prisma.order.findMany({
      where: {
        status: "NEW",
        courierId: null,
        lat: { not: null },
        lng: { not: null },
        OR: [
          { deliveryDate: routeDate },
          { deliveryDate: null, crmCreatedAt: { gte: startOfDay, lte: endOfDay } },
        ],
      },
    });

    if (allOrders.length === 0)
      return NextResponse.json({ error: "Нет свободных заказов" }, { status: 400 });

    // ── Фильтр по слотам (если передан) ──────────────────────────────────────
    let targetOrders = allOrders;
    if (selectedSlots?.length > 0) {
      targetOrders = allOrders.filter(o => {
        if (!o.slotFrom) return selectedSlots.includes("Другие");
        const exact = SLOTS.find(s => s.from === o.slotFrom && s.to === o.slotTo);
        if (exact) return selectedSlots.includes(exact.label);
        const match = SLOTS.find(s => o.slotFrom! > s.from && o.slotFrom! <= s.to);
        if (match) return selectedSlots.includes(match.label);
        return selectedSlots.includes("Другие");
      });
    }

    if (targetOrders.length === 0)
      return NextResponse.json({ error: "В выбранных слотах нет свободных заказов" }, { status: 400 });

    // ── Загружаем курьеров ────────────────────────────────────────────────────
    const activeCouriers = await prisma.courier.findMany({
      where: { isActive: true },
      include: { shifts: { where: { date: routeDate } } },
    });

    let availableCouriers = activeCouriers.filter(c => c.shifts.length > 0);
    if (availableCouriers.length === 0)
      return NextResponse.json({ error: "Нет курьеров на смене" }, { status: 400 });

    availableCouriers.sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3));

    // ── Классифицируем заказы ─────────────────────────────────────────────────
    const enriched = targetOrders.map(o => ({
      ...o,
      ...classifyOrder(o),
      aiPriority: classifyOrder(o).isHeavy ? "HIGH" : "NORMAL",
    }));

    // Разделяем: только-авто (meura) и «обычные»
    const meuraOrders  = enriched.filter(o => o.isMeura);
    const normalOrders = enriched.filter(o => !o.isMeura);

    // Пешие / авто курьеры
    const walkingCouriers = availableCouriers.filter(c => !c.isAuto);
    const autoCouriers    = availableCouriers.filter(c => c.isAuto);

    // ── Строим кластеры локально (БЕЗ AI) ────────────────────────────────────

    interface Cluster {
      orders: typeof enriched;
      type: "walking" | "auto";
      label: string;
    }

    const clusters: Cluster[] = [];

    // Meura → авто-кластеры
    if (meuraOrders.length > 0) {
      const mClusters = clusterBySlot(meuraOrders, LIMITS.auto.maxPointsPerRoute);
      mClusters.forEach((c, i) =>
        clusters.push({ orders: c, type: "auto", label: `meura-${i}` })
      );
    }

    // «Маленькие» заказы → пешие
    const smallOrders = normalOrders.filter(o => o.isSmall);
    if (smallOrders.length > 0) {
      const sClusters = clusterBySlot(smallOrders, LIMITS.walking.maxPointsPerRoute);
      sClusters.forEach((c, i) =>
        clusters.push({ orders: c, type: "walking", label: `small-${i}` })
      );
    }

    // «Обычные» (не meura, не small) → авто (предпочтительно) или пешие
    const bigOrders = normalOrders.filter(o => !o.isSmall);
    if (bigOrders.length > 0) {
      // Сначала пробуем авто-кластеры
      const bClusters = clusterBySlot(bigOrders, LIMITS.auto.maxPointsPerRoute);
      bClusters.forEach((c, i) =>
        clusters.push({ orders: c, type: autoCouriers.length > 0 ? "auto" : "walking", label: `big-${i}` })
      );
    }

    // ── Формируем промпт для AI: только матчинг кластер→курьер ───────────────

    const promptClusters = clusters.map((cl, i) => ({
      clusterId: i,
      type: cl.type,
      count: cl.orders.length,
      slotRange: `${cl.orders[0]?.slotFrom ?? "?"} – ${cl.orders[cl.orders.length - 1]?.slotTo ?? "?"}`,
      label: cl.label,
    }));

    const promptCouriers = availableCouriers.map(c => {
      const shift = c.shifts[0] as any;
      return {
        id: c.id,
        type: c.isAuto ? "auto" : "walking",
        priority: c.priority ?? 3,
        workHours: `${shift?.startTime ?? "10:00"}-${shift?.endTime ?? "22:00"}`,
        hasHomeAddress: !!(c.homeLat && c.homeLng),
      };
    });

    const systemPrompt = `Ты — диспетчер. Назначь каждый кластер заказов на курьера.

ПРАВИЛА (строго):
1. Кластер с type="auto" — только курьеру с type="auto".
2. Кластер с type="walking" — предпочтительно курьеру с type="walking", но если их нет — авто.
3. Один курьер за день: макс ${LIMITS.auto.maxRoutesPerDay} маршрута, макс ${LIMITS.auto.maxPointsPerDay} точек суммарно.
4. Распредели ВСЕ кластеры. Если курьеров мало — перегружай, но отметь это.
5. Выбирай курьеров с бо́льшим priority в первую очередь.

Ответь ТОЛЬКО JSON — массив объектов без пояснений:
[{ "clusterId": 0, "courierId": 123 }, ...]`;

    let aiAssignments: { clusterId: number; courierId: number }[] = [];
    try {
      const response = await client.chat.completions.create({
        model: `gpt://${YANDEX_CLOUD_FOLDER}/${YANDEX_CLOUD_MODEL}`,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Кластеры: ${JSON.stringify(promptClusters)}\nКурьеры: ${JSON.stringify(promptCouriers)}`,
          },
        ],
        temperature: 0.05,
      });

      let content = response.choices[0]?.message?.content?.trim() ?? "[]";
      if (content.startsWith("```"))
        content = content.replace(/^```json/g, "").replace(/^```/g, "").replace(/```$/g, "").trim();
      aiAssignments = JSON.parse(content);
    } catch (e) {
      console.error("Ошибка AI:", e);
      // Фоллбэк: назначаем по-очереди
      clusters.forEach((cl, i) => {
        const pool = cl.type === "auto" ? autoCouriers : (walkingCouriers.length > 0 ? walkingCouriers : autoCouriers);
        const courier = pool[i % pool.length] ?? availableCouriers[0];
        if (courier) aiAssignments.push({ clusterId: i, courierId: courier.id });
      });
    }

    // ── Применяем назначения ──────────────────────────────────────────────────
    const routeDay = routeDate.split("-")[2];
    const prefix   = `AI-${routeDay}-`;

    let routesCreated = 0;
    let ordersAssigned = 0;
    const assignedSet = new Set<string>();

    // Счётчики лимитов курьера
    const courierRouteCount: Record<number, number> = {};
    const courierPointCount: Record<number, number> = {};
    const overloadWarnings: string[] = [];

    for (const assignment of aiAssignments) {
      const cluster = clusters[assignment.clusterId];
      if (!cluster) continue;

      const courierId = Number(assignment.courierId);
      const courier   = availableCouriers.find(c => c.id === courierId);
      if (!courier) continue;

      const limits = courier.isAuto ? LIMITS.auto : LIMITS.walking;

      // Проверяем лимиты (предупреждаем, но не блокируем)
      const rCount = courierRouteCount[courierId] ?? 0;
      const pCount = courierPointCount[courierId] ?? 0;
      if (rCount >= limits.maxRoutesPerDay || pCount + cluster.orders.length > limits.maxPointsPerDay) {
        overloadWarnings.push(
          `Курьер #${courierId} перегружен: ${rCount + 1} маршрут, ${pCount + cluster.orders.length} точек`
        );
      }

      // Отфильтровываем уже назначенные
      const freshOrders = cluster.orders.filter(o => !assignedSet.has(o.id));
      if (freshOrders.length === 0) continue;

      // Оптимизируем порядок с учётом дома курьера
      const optimized = optimizeCluster(
        freshOrders,
        STORE_LAT,
        STORE_LNG,
        courier.homeLat,
        courier.homeLng
      );

      const routeName = `${prefix}${courierId}-${Math.floor(Math.random() * 1000)}`;
      const link = `https://yandex.ru/maps/?rtext=${STORE_LAT},${STORE_LNG}~${optimized.map(o => `${o.lat},${o.lng}`).join("~")}&rtt=${courier.isAuto ? "auto" : "mt"}`;

      const newRoute = await prisma.route.create({
        data: { name: routeName, link, date: routeDate, courierId: courier.id, isDraft: true },
      });

      for (let i = 0; i < optimized.length; i++) {
        await prisma.order.update({
          where: { id: optimized[i].id },
          data: {
            courierId:  courier.id,
            courier:    courier.fullName,
            routeId:    newRoute.id,
            routeOrder: i + 1,
            status:     "ASSIGNED",
          },
        });
        assignedSet.add(optimized[i].id);
      }

      courierRouteCount[courierId] = (courierRouteCount[courierId] ?? 0) + 1;
      courierPointCount[courierId] = (courierPointCount[courierId] ?? 0) + optimized.length;

      routesCreated++;
      ordersAssigned += optimized.length;
    }

    const leftOverOrders = targetOrders.filter(o => !assignedSet.has(o.id));

    return NextResponse.json({
      success: true,
      routesCreated,
      ordersAssigned,
      leftOver: leftOverOrders.length,
      warnings: overloadWarnings.length > 0 ? overloadWarnings : undefined,
    });

  } catch (e: any) {
    console.error("Общая ошибка auto-generate:", e);
    return NextResponse.json({ error: String(e.message) }, { status: 500 });
  }
}