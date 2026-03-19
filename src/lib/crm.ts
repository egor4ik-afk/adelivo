// src/lib/crm.ts
import axios from "axios";
import { prisma } from "./prisma";
import { notify } from "./notifications";
import { OrderStatus } from "@prisma/client";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;
const GEO_KEY = process.env.YANDEX_GEOCODER_KEY;

// ── Slot parser ───────────────────────────────────────────
// RetailCRM возвращает delivery.time как:
// 1. Объект: { from: "10:00", to: "12:00" }
// 2. Строку: "с 10:00 до 12:00" (старый формат / webhook)
export function parseSlot(raw: unknown) {
  if (!raw) return { from: null, to: null, text: null };

  // Объект { from, to } — реальный API
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, string>;
    const from = r.from ?? null;
    const to = r.to ?? null;
    const text = from && to ? `с ${from} до ${to}` : from ?? null;
    return { from, to, text };
  }

  // Строка — webhook или старый формат
  if (typeof raw === "string") {
    const range = raw.match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);
    if (range) return { from: range[1], to: range[2], text: raw };
    const single = raw.match(/(\d{1,2}:\d{2})/);
    if (single) return { from: single[1], to: null, text: raw };
  }

  return { from: null, to: null, text: null };
}

// ── Order mapper ──────────────────────────────────────────
export function mapCrmOrder(order: CrmOrder) {
  const slot = parseSlot(order.delivery?.time);

  // Состав: offer.displayName > offer.name > productName
  const items = order.items
    ?.map(i => {
      const name = i.offer?.displayName ?? i.offer?.name ?? i.productName ?? "?";
      const qty = i.quantity ?? 1;
      const price = i.initialPrice ?? 0;
      return price > 0 ? `${name} — ${price}₽, ${qty}шт` : `${name} — ${qty}шт`;
    })
    .join("; ");

  // Курьер: delivery.service.name (если есть) или firstName+lastName из заказа
  // В реальном API курьер может быть в customFields или не передаваться
  const courier = order.delivery?.service?.name ?? null;

  return {
    crmId: String(order.id),
    externalId: order.externalId ?? order.number ?? null,
    crmStatus: order.status ?? null,
    status: mapCrmStatus(order.status),
    address: order.delivery?.address?.text ?? null,
    courier,
    price: order.delivery?.cost ?? null,
    comment: order.customerComment ?? null,
    opComment: order.managerComment ?? null,
    items: items ?? null,
    slotFrom: slot.from,
    slotTo: slot.to,
    slotRaw: slot.text,
    deliveryType: order.delivery?.code ?? null,
    crmCreatedAt: order.createdAt ? new Date(order.createdAt) : null,
  };
}

// ── Status mapping ────────────────────────────────────────
const CRM_STATUS_MAP: Record<string, OrderStatus> = {
  new: OrderStatus.NEW,
  "in-progress": OrderStatus.ASSIGNED,
  assembling: OrderStatus.ASSIGNED,
  delivery: OrderStatus.IN_DELIVERY,
  complete: OrderStatus.DELIVERED,
  cancel: OrderStatus.CANCELLED,
  return: OrderStatus.RETURNED,
};

export function mapCrmStatus(crmStatus?: string): OrderStatus {
  if (!crmStatus) return OrderStatus.NEW;
  return CRM_STATUS_MAP[crmStatus] ?? OrderStatus.NEW;
}

const STATUS_TO_CRM: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.DELIVERED]: "complete",
  [OrderStatus.RETURNED]: "return",
  [OrderStatus.CANCELLED]: "cancel",
  [OrderStatus.IN_DELIVERY]: "delivery",
};

// ── Upsert order + notify ─────────────────────────────────
export async function upsertOrder(crmOrder: CrmOrder) {
  const data = mapCrmOrder(crmOrder);

  const existing = await prisma.order.findUnique({
    where: { crmId: data.crmId },
  });

  const order = await prisma.order.upsert({
    where: { crmId: data.crmId },
    update: data,
    create: { ...data, isInvalid: false, geocoded: false },
  });

  if (!existing) {
    notify({ type: "order.new", order }).catch(console.error);
  } else if (existing.status !== order.status) {
    notify({ type: "order.updated", order, previousStatus: existing.status }).catch(console.error);
  }

  return order;
}

// ── Geocoding ─────────────────────────────────────────────
export async function geocodeAddress(address: string) {
  if (!GEO_KEY || !address) return null;
  try {
    const res = await axios.get("https://geocode-maps.yandex.ru/1.x/", {
      params: {
        apikey: GEO_KEY,
        geocode: address,
        format: "json",
        results: 1,
        ll: "37.6175,55.7520",
        spn: "1.0,1.0",
      },
      timeout: 5000,
    });
    const members = res.data?.response?.GeoObjectCollection?.featureMember ?? [];
    if (!members.length) return null;
    const point = members[0]?.GeoObject?.Point?.pos;
    if (!point) return null;
    const [lng, lat] = point.split(" ").map(Number);
    const precision = members[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.precision;
    return { lat, lng, precision, isExact: ["exact", "number", "near", "range"].includes(precision) };
  } catch (err) {
    console.error("Geocode error:", err);
    return null;
  }
}

// ── Geocode new orders ────────────────────────────────────
export async function geocodeNewOrders() {
  const orders = await prisma.order.findMany({
    where: { geocoded: false, address: { not: null } },
    take: 20,
  });

  if (orders.length === 0) return;
  console.log(`[Geocode] Processing ${orders.length} orders`);

  const invalidOrders: Array<{ externalId: string | null; address: string | null; reason: string }> = [];

  for (const order of orders) {
    if (!order.address) continue;
    try {
      const geo = await geocodeAddress(order.address);

      if (!geo) {
        await prisma.order.update({
          where: { id: order.id },
          data: { geocoded: true, isInvalid: true, invalidReason: "Адрес не найден", status: OrderStatus.INVALID_ADDRESS },
        });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: "Адрес не найден" });
        continue;
      }

      if (!geo.isExact) {
        await prisma.order.update({
          where: { id: order.id },
          data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: true, invalidReason: `Неточный геокод: ${geo.precision}`, status: OrderStatus.INVALID_ADDRESS },
        });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: `Неточный геокод: ${geo.precision}` });
        continue;
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: false,
          status: order.status === OrderStatus.NEW ? OrderStatus.GEOCODED : order.status,
        },
      });
      console.log(`[Geocode] OK: ${order.address}`);

    } catch (err) {
      console.error(`[Geocode] Error for ${order.id}:`, err);
      await prisma.order.update({
        where: { id: order.id },
        data: { geocoded: true, isInvalid: true, invalidReason: "Ошибка геокодирования", status: OrderStatus.INVALID_ADDRESS },
      }).catch(() => {});
    }
  }

  if (invalidOrders.length > 0) {
    notify({ type: "address.invalid", orders: invalidOrders }).catch(console.error);
  }
}

// ── Fallback polling ──────────────────────────────────────
export async function pollCrmOrders() {
  if (!CRM_URL || !CRM_KEY) {
    console.warn("[CRM Poll] Credentials not set");
    return;
  }

  const state = await prisma.syncState.findFirst();
  const lastSync = state?.lastSyncAt ?? new Date(Date.now() - 3_600_000);

  // Формат даты для RetailCRM: Y-m-d
  const dateFrom = lastSync.toISOString().split("T")[0];

  console.log(`[CRM Poll] Syncing orders since ${dateFrom}`);

  let page = 1;
  let hasMore = true;
  let total = 0;

  while (hasMore) {
    const res = await axios.get(`${CRM_URL}/api/v5/orders`, {
      params: {
        apiKey: CRM_KEY,
        "filter[createdAtFrom]": dateFrom,
        limit: 100,  // только 20, 50 или 100
        page,
      },
      timeout: 15_000,
    });

    const { orders = [], pagination } = res.data;
    total += orders.length;

    for (const order of orders) {
      await upsertOrder(order);
    }

    hasMore = pagination?.currentPage < pagination?.totalPageCount;
    page++;
  }

  await prisma.syncState.upsert({
    where: { id: 1 },
    update: { lastSyncAt: new Date() },
    create: { id: 1, lastSyncAt: new Date() },
  });

  await geocodeNewOrders();
  console.log(`[CRM Poll] Done — ${total} orders processed`);
}

// ── Update order status in CRM ────────────────────────────
export async function updateCrmOrderStatus(crmId: string, status: OrderStatus) {
  const crmStatus = STATUS_TO_CRM[status];
  if (!crmStatus || !CRM_URL || !CRM_KEY) return;
  await axios.post(
    `${CRM_URL}/api/v5/orders/${crmId}/edit`,
    { order: { status: crmStatus } },
    { params: { apiKey: CRM_KEY }, timeout: 5000 }
  );
}

// ── Types ─────────────────────────────────────────────────
export interface CrmOrder {
  id: number;
  number?: string;
  externalId?: string;
  status?: string;
  createdAt?: string;
  customerComment?: string;
  managerComment?: string;
  firstName?: string;
  lastName?: string;
  delivery?: {
    // time может быть объектом { from, to } или строкой
    time?: unknown;
    cost?: number;
    code?: string;
    address?: { text?: string };
    service?: { name?: string; code?: string };
  };
  items?: Array<{
    productName?: string;
    quantity?: number;
    initialPrice?: number;
    offer?: {
      name?: string;
      displayName?: string;
    };
  }>;
}