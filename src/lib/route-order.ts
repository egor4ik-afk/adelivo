// src/lib/route-order.ts
// Пересчёт порядка точек в маршруте.
//
// Зачем: курьер редко едет строго по плану. Пробки, недозвон, клиент попросил
// «привезите позже» — и вторая точка оказывается доставленной раньше первой.
// Если после этого оставить старую нумерацию, курьер видит маршрут, который
// не совпадает с реальностью: доставленная точка висит вторым номером,
// а следующая по факту — четвёртым.
//
// Правило простое:
//   1. Доставленные точки идут сверху в том порядке, в котором их реально закрыли.
//   2. Остальные пересчитываются от последней доставленной: сначала временное
//      окно, потом близость. Слот важнее географии — опоздать к клиенту хуже,
//      чем проехать лишний километр.

import { prisma } from "./prisma";

type Point = {
  id: string;
  routeOrder: number | null;
  status: string;
  deliveredAt: Date | null;
  lat: number | null;
  lng: number | null;
  slotFrom: string | null;
  slotTo: string | null;
};

const DONE = ["DELIVERED", "RETURNED", "CANCELLED"];

/** Расстояние по прямой, км. Для сравнения точек внутри города этого достаточно. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "14:30" → 870. Точки без слота уезжают в конец. */
function minutes(t: string | null): number {
  if (!t) return 24 * 60 + 1;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 24 * 60 + 1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Пересчитывает routeOrder у всех точек маршрута.
 * Возвращает количество изменённых точек.
 */
export async function recalcRouteOrder(routeId: string): Promise<number> {
  const points: Point[] = await prisma.order.findMany({
    where: { routeId },
    select: {
      id: true, routeOrder: true, status: true, deliveredAt: true,
      lat: true, lng: true, slotFrom: true, slotTo: true,
    },
  });
  if (points.length < 2) return 0;

  const closed = points.filter((p) => DONE.includes(p.status));
  const open = points.filter((p) => !DONE.includes(p.status));

  // 1. Закрытые — по факту закрытия. Если времени нет (например, отмена
  //    без отметки), используем прежний номер, чтобы порядок не прыгал.
  closed.sort((a, b) => {
    const ta = a.deliveredAt ? a.deliveredAt.getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.deliveredAt ? b.deliveredAt.getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return (a.routeOrder ?? 0) - (b.routeOrder ?? 0);
  });

  // 2. Открытые — жадный обход от последней закрытой точки.
  //    Внутри одного временного окна выбираем ближайшую.
  const lastClosed = [...closed].reverse().find((p) => p.lat != null && p.lng != null);
  let cursor = lastClosed && lastClosed.lat != null && lastClosed.lng != null
    ? { lat: lastClosed.lat, lng: lastClosed.lng }
    : null;

  const ordered: Point[] = [];
  const rest = [...open];

  while (rest.length) {
    // самое раннее окно среди оставшихся
    const earliest = Math.min(...rest.map((p) => minutes(p.slotTo ?? p.slotFrom)));
    // точки, которые нужно закрыть в этом же окне (допуск — час)
    const wave = rest.filter((p) => minutes(p.slotTo ?? p.slotFrom) <= earliest + 60);

    let next = wave[0];
    if (cursor) {
      let best = Number.POSITIVE_INFINITY;
      for (const p of wave) {
        if (p.lat == null || p.lng == null) continue;
        const d = distanceKm(cursor, { lat: p.lat, lng: p.lng });
        if (d < best) { best = d; next = p; }
      }
    }

    ordered.push(next);
    rest.splice(rest.indexOf(next), 1);
    if (next.lat != null && next.lng != null) cursor = { lat: next.lat, lng: next.lng };
  }

  // 3. Записываем новую нумерацию, трогая только изменившиеся точки
  const final = [...closed, ...ordered];
  let changed = 0;

  await prisma.$transaction(
    final
      .map((p, i) => ({ p, order: i + 1 }))
      .filter(({ p, order }) => p.routeOrder !== order)
      .map(({ p, order }) => {
        changed++;
        return prisma.order.update({ where: { id: p.id }, data: { routeOrder: order } });
      })
  );

  return changed;
}

/**
 * Пересчитать маршрут заказа, если он в маршруте.
 * Вызывается после смены статуса — безопасно дёргать на любом статусе.
 */
export async function recalcRouteOfOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { routeId: true },
  });
  if (!order?.routeId) return;
  try {
    await recalcRouteOrder(order.routeId);
  } catch (e) {
    // Пересчёт — вещь вспомогательная: если он упал, статус всё равно сохранён
    console.error("[recalcRouteOrder]", e);
  }
}
