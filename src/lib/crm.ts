// src/lib/crm.ts
import axios from "axios";
import { prisma } from "./prisma";
import { OrderStatus } from "@prisma/client";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;
const GEO_KEY = process.env.YANDEX_GEOCODER_KEY;

// ── Slot parser ───────────────────────────────────────────
// Handles: "с 20:00 до 22:00", "в 10:00", "с 09:00 до 11:00"
export function parseSlot(raw: string | undefined | null) {
  if (!raw) return { from: null, to: null };

  const range = raw.match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);
  if (range) return { from: range[1], to: range[2] };

  const single = raw.match(/(\d{1,2}:\d{2})/);
  if (single) return { from: single[1], to: null };

  return { from: null, to: null };
}

// ── Order mapper ──────────────────────────────────────────
// Maps RetailCRM v5 order object → our DB shape
export function mapCrmOrder(order: CrmOrder) {
  const slot = parseSlot(order.delivery?.time);

  const items = order.items
    ?.map((i) => `${i.offer?.name ?? i.productName ?? "?"} — ${i.quantity}шт`)
    .join("; ");

  return {
    crmId: String(order.id),
    externalId: order.number ?? null,
    crmStatus: order.status ?? null,
    status: mapCrmStatus(order.status),
    address: order.delivery?.address?.text ?? null,
    courier: order.delivery?.service?.name ?? null,
    price: order.delivery?.cost ?? null,
    comment: order.customerComment ?? null,
    opComment: order.managerComment ?? null,
    items: items ?? null,
    slotFrom: slot.from,
    slotTo: slot.to,
    slotRaw: order.delivery?.time ?? null,
    deliveryType: order.delivery?.type ?? null,
    crmCreatedAt: order.createdAt ? new Date(order.createdAt) : null,
  };
}

// ── Status mapping ────────────────────────────────────────
const CRM_STATUS_MAP: Record<string, OrderStatus> = {
  new: OrderStatus.NEW,
  "in-progress": OrderStatus.ASSIGNED,
  "assembling": OrderStatus.ASSIGNED,
  "delivery": OrderStatus.IN_DELIVERY,
  "complete": OrderStatus.DELIVERED,
  "cancel": OrderStatus.CANCELLED,
  "return": OrderStatus.RETURNED,
};

export function mapCrmStatus(crmStatus?: string): OrderStatus {
  if (!crmStatus) return OrderStatus.NEW;
  return CRM_STATUS_MAP[crmStatus] ?? OrderStatus.NEW;
}

// Reverse: our status → CRM status
const STATUS_TO_CRM: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.DELIVERED]: "complete",
  [OrderStatus.RETURNED]: "return",
  [OrderStatus.CANCELLED]: "cancel",
  [OrderStatus.IN_DELIVERY]: "delivery",
};

// ── Upsert order ──────────────────────────────────────────
export async function upsertOrder(crmOrder: CrmOrder) {
  const data = mapCrmOrder(crmOrder);

  return prisma.order.upsert({
    where: { crmId: data.crmId },
    update: data,
    create: { ...data, isInvalid: false, geocoded: false },
  });
}

// ── Geocoding ─────────────────────────────────────────────
export async function geocodeAddress(address: string) {
  if (!GEO_KEY || !address) return null;

  try {
    const res = await axios.get(
      "https://geocode-maps.yandex.ru/1.x/",
      {
        params: {
          apikey: GEO_KEY,
          geocode: address,
          format: "json",
          results: 1,
          ll: "37.6175,55.7520", // центр Москвы как подсказка
          spn: "1.0,1.0",
        },
        timeout: 5000,
      }
    );

    const members =
      res.data?.response?.GeoObjectCollection?.featureMember ?? [];
    if (members.length === 0) return null;

    const point = members[0]?.GeoObject?.Point?.pos;
    if (!point) return null;

    const [lng, lat] = point.split(" ").map(Number);

    // Проверяем precision — если ниже "house" — помечаем как сомнительный
    const precision =
      members[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.precision;
    const isExact = ["exact", "number", "near", "range"].includes(precision);

    return { lat, lng, precision, isExact };
  } catch (err) {
    console.error("Geocode error:", err);
    return null;
  }
}

// ── Process new/ungeocoded orders ─────────────────────────
export async function geocodeNewOrders() {
  const orders = await prisma.order.findMany({
    where: { geocoded: false, address: { not: null } },
    take: 20, // батч, чтобы не флудить API
  });

  for (const order of orders) {
    if (!order.address) continue;

    const geo = await geocodeAddress(order.address);

    if (!geo) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          geocoded: true,
          isInvalid: true,
          invalidReason: "Адрес не найден геокодером",
          status: OrderStatus.INVALID_ADDRESS,
        },
      });
      continue;
    }

    if (!geo.isExact) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          lat: geo.lat,
          lng: geo.lng,
          geocoded: true,
          isInvalid: true,
          invalidReason: `Неточный геокод: ${geo.precision}`,
          status: OrderStatus.INVALID_ADDRESS,
        },
      });
      continue;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        lat: geo.lat,
        lng: geo.lng,
        geocoded: true,
        isInvalid: false,
        status: order.status === OrderStatus.NEW ? OrderStatus.GEOCODED : order.status,
      },
    });
  }
}

// ── Fallback polling ──────────────────────────────────────
export async function pollCrmOrders() {
  if (!CRM_URL || !CRM_KEY) {
    console.warn("CRM credentials not set, skipping poll");
    return;
  }

  const state = await prisma.syncState.findFirst();
  const lastSync = state?.lastSyncAt ?? new Date(Date.now() - 3600_000);

  console.log(`[CRM Poll] Syncing orders since ${lastSync.toISOString()}`);

  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await axios.get(`${CRM_URL}/api/v5/orders`, {
      params: {
        apiKey: CRM_KEY,
        "filter[createdAtFrom]": lastSync.toISOString(),
        limit: 100,
        page,
      },
      timeout: 10_000,
    });

    const { orders = [], pagination } = res.data;

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

  // После синхронизации — геокодируем новые адреса
  await geocodeNewOrders();

  console.log("[CRM Poll] Done");
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
  status?: string;
  createdAt?: string;
  customerComment?: string;
  managerComment?: string;
  delivery?: {
    time?: string;
    cost?: number;
    type?: string;
    address?: { text?: string };
    service?: { name?: string };
  };
  items?: Array<{
    productName?: string;
    quantity?: number;
    offer?: { name?: string };
  }>;
}
