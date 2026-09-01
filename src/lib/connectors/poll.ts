// src/lib/connectors/poll.ts
// Универсальный приём заказов: любой коннектор → одна запись в базу.
//
// Доменная логика (геокодинг, зоны, себестоимость) не дублируется —
// берётся из lib/crm.ts. Здесь только «привести к нашему виду и сохранить».

import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";
import { geocodeAddress, calcBaseDeliveryPrice, parseSlot } from "@/lib/crm";
import type { NormalizedOrder, ConnectorCreds, ConnectorType } from "./types";
import { retailCrmConnector } from "./retailcrm";
import { bitrixConnector } from "./bitrix24";
import { onecConnector } from "./onec";
import { resolveCreds, activeShops } from "./credentials";

export function getConnector(type: ConnectorType) {
  switch (type) {
    case "RETAILCRM": return retailCrmConnector;
    case "BITRIX24":  return bitrixConnector;
    case "ONEC":      return onecConnector;
    default:          return null; // WEBHOOK не опрашивается — он пишет сам
  }
}

/**
 * Ключ заказа в нашей базе.
 *
 * Order.crmId уникален глобально, а номера заказов уникальны только внутри
 * магазина. Поэтому для всех магазинов, кроме исторических (bunch, Meura),
 * ключ составной: "slug:externalId". Так два магазина с заказом №100
 * не столкнутся, и менять уникальный индекс в схеме не нужно.
 */
const LEGACY_SLUGS = ["bunch", "kaktusfiori", "meura-flowers"];

export function buildCrmId(shopSlug: string, externalId: string): string {
  return LEGACY_SLUGS.includes(shopSlug) ? externalId : `${shopSlug}:${externalId}`;
}

function mapStatus(raw: string | null, statusMap: Record<string, string> | null): OrderStatus | null {
  if (!raw) return null;
  const mapped = statusMap?.[raw];
  if (mapped && mapped in OrderStatus) return mapped as OrderStatus;
  return null;
}

/** Сохранить нормализованный заказ. Возвращает true, если заказ новый. */
export async function upsertNormalized(
  shop: { id: string; slug: string },
  o: NormalizedOrder,
  creds: ConnectorCreds
): Promise<boolean> {
  if (!o.externalId) return false;

  const crmId = buildCrmId(shop.slug, o.externalId);
  const existing = await prisma.order.findUnique({ where: { crmId } });

  // Геокодим только новые заказы и те, у кого адрес изменился —
  // иначе на каждом опросе будем зря жечь лимиты Яндекса
  const addressChanged = !!o.address && existing?.address !== o.address;
  let geo: { lat: number; lng: number } | null = null;
  if (o.address && (!existing || addressChanged)) {
    geo = await geocodeAddress(o.address);
  }

  const slot = o.slotRaw ? parseSlot(o.slotRaw) : null;
  const status = mapStatus(o.externalStatus, creds.statusMap);

  const data = {
    externalId: o.externalId,
    shopId: shop.id,
    shop: shop.slug,
    address: o.address ?? existing?.address ?? null,
    ...(geo
      ? {
          lat: geo.lat,
          lng: geo.lng,
          geocoded: true,
          isInvalid: false,
          invalidReason: null,
          costPrice: calcBaseDeliveryPrice(geo.lat, geo.lng),
        }
      : addressChanged
      ? { geocoded: false, isInvalid: true, invalidReason: "Адрес не определился" }
      : {}),
    price: o.price ?? existing?.price ?? null,
    items: o.items ?? existing?.items ?? null,
    comment: o.comment ?? existing?.comment ?? null,
    name: o.recipientName ?? existing?.name ?? null,
    recipientPhone: o.recipientPhone ?? existing?.recipientPhone ?? null,
    customerName: o.customerName ?? existing?.customerName ?? null,
    customerPhone: o.customerPhone ?? existing?.customerPhone ?? null,
    deliveryDate: o.deliveryDate ?? existing?.deliveryDate ?? null,
    slotFrom: slot?.from ?? existing?.slotFrom ?? null,
    slotTo: slot?.to ?? existing?.slotTo ?? null,
    slotRaw: o.slotRaw ?? existing?.slotRaw ?? null,
    crmStatus: o.externalStatus ?? existing?.crmStatus ?? null,
    crmCreatedAt: o.createdAt ?? existing?.crmCreatedAt ?? new Date(),
  };

  if (existing) {
    // Статус, назначенный у нас, важнее пришедшего из источника:
    // курьер уже мог отметить «в пути», а источник об этом ещё не знает
    const keepLocal: OrderStatus[] = ["ASSIGNED", "IN_DELIVERY", "DELIVERED", "RETURNED"];
    const nextStatus =
      status && !keepLocal.includes(existing.status) ? status : existing.status;

    await prisma.order.update({
      where: { crmId },
      data: { ...data, status: nextStatus, changedAt: new Date() },
    });
    return false;
  }

  await prisma.order.create({
    data: { ...data, crmId, status: status ?? OrderStatus.NEW },
  });
  return true;
}

/** Опросить один магазин. */
export async function pollShop(shopSlug: string, sinceDays = 2) {
  const shop = await prisma.shop.findUnique({ where: { slug: shopSlug } });
  if (!shop) return { ok: false, error: "Магазин не найден" };

  const creds = await resolveCreds(shopSlug);
  if (!creds) return { ok: false, error: "Подключение не настроено" };

  const connector = getConnector(creds.type);
  if (!connector) return { ok: true, created: 0, note: "Вебхук не опрашивается" };

  try {
    const orders = await connector.fetchOrders(creds, sinceDays);
    let created = 0;
    for (const o of orders) {
      if (await upsertNormalized(shop, o, creds)) created++;
    }

    await prisma.connector.updateMany({
      where: { shopId: shop.id },
      data: { lastSyncAt: new Date(), lastError: null, errorCount: 0 },
    });

    return { ok: true, total: orders.length, created };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Считаем ошибки подряд: после десяти коннектор выключается,
    // чтобы не долбить чужой API сломанным ключом сутками
    const conn = await prisma.connector.findUnique({ where: { shopId: shop.id } });
    const next = (conn?.errorCount ?? 0) + 1;
    await prisma.connector.updateMany({
      where: { shopId: shop.id },
      data: { lastError: message, errorCount: next, ...(next >= 10 ? { isActive: false } : {}) },
    });
    return { ok: false, error: message };
  }
}

/**
 * Опросить все магазины с включённым коннектором.
 *
 * ВАЖНО: исторические магазины (bunch, Meura) сюда не попадают —
 * их по-прежнему обслуживают pollCrmOrders и pollMeuraOrders из lib/crm.ts.
 * Так переход идёт без остановки работающего потока: новый путь обкатывается
 * на новых магазинах, старый продолжает работать как работал.
 */
export async function pollAllShops(sinceDays = 2) {
  const shops = await activeShops();
  const results: Record<string, unknown> = {};

  for (const shop of shops) {
    if (LEGACY_SLUGS.includes(shop.slug)) continue;
    results[shop.slug] = await pollShop(shop.slug, sinceDays);
  }

  return results;
}
