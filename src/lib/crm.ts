// src/lib/crm.ts
import axios from "axios";
import { prisma } from "./prisma";
import { notify } from "./notifications";
import { OrderStatus } from "@prisma/client";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;
const GEO_KEY = process.env.YANDEX_GEOCODER_KEY;

// ── Slot parser ───────────────────────────────────────────
export function parseSlot(raw: unknown) {
  if (!raw) return { from: null, to: null, text: null };

  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, string>;
    const from = r.from ?? null;
    const to = r.to ?? null;
    const text = from && to ? `с ${from} до ${to}` : from ?? null;
    return { from, to, text };
  }

  if (typeof raw === "string") {
    const range = raw.match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);
    if (range) return { from: range[1], to: range[2], text: raw };
    const single = raw.match(/(\d{1,2}:\d{2})/);
    if (single) return { from: single[1], to: null, text: raw };
  }

  return { from: null, to: null, text: null };
}

// ── Status mapping ────────────────────────────────────────
const CRM_STATUS_MAP: Record<string, OrderStatus> = {
  "new": OrderStatus.NEW,
  "accepted": OrderStatus.ASSIGNED,
  "send-to-assembling": OrderStatus.ASSIGNED,
  "assembling": OrderStatus.ASSIGNED,
  "assembling-complete": OrderStatus.ASSIGNED,
  "kurer-naznachen": OrderStatus.ASSIGNED,
  "send-to-delivery": OrderStatus.IN_DELIVERY,
  "delivering": OrderStatus.IN_DELIVERY,
  "complete": OrderStatus.DELIVERED,
  "cancel-other": OrderStatus.CANCELLED,
  "return": OrderStatus.RETURNED,
  "chastichnyi-vozvrat": OrderStatus.RETURNED,
};

export function mapCrmStatus(crmStatus?: string): OrderStatus {
  if (!crmStatus) return OrderStatus.NEW;
  return CRM_STATUS_MAP[crmStatus] ?? OrderStatus.NEW;
}

const STATUS_TO_CRM: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.ASSIGNED]: "kurer-naznachen",
  [OrderStatus.IN_DELIVERY]: "delivering",
  [OrderStatus.DELIVERED]: "complete",
  [OrderStatus.RETURNED]: "return",
  [OrderStatus.CANCELLED]: "cancel-other",
};

// ── Order mapper ──────────────────────────────────────────
export function mapCrmOrder(order: CrmOrder) {
  const slot = parseSlot(order.delivery?.time);

  const items = order.items
    ?.map(i => {
      const name = i.offer?.displayName ?? i.offer?.name ?? i.productName ?? "?";
      const qty = i.quantity ?? 1;
      const price = i.initialPrice ?? 0;
      return price > 0 ? `${name} — ${price}₽, ${qty}шт` : `${name} — ${qty}шт`;
    })
    .join("; ");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dData = order.delivery?.data as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cFields = (order as any).customFields as any;

  if (typeof dData === "string") {
    try { dData = JSON.parse(dData); } catch (_) {}
  }

  // ── Курьер: берём только из personalных данных курьера или customFields.
  //    НЕ берём delivery.service.name — это название службы, не человек.
  let parsedCourier: string | null = null;
  if (dData) {
    if (dData.firstName || dData.lastName) {
      parsedCourier = [dData.firstName, dData.lastName].filter(Boolean).join(" ");
    } else if (dData.courier?.name) {
      parsedCourier = dData.courier.name;
    } else if (typeof dData.courier === "string" && dData.courier.trim()) {
      parsedCourier = dData.courier.trim();
    } else if (dData.driver?.name) {
      parsedCourier = dData.driver.name;
    } else if (typeof dData.driver === "string" && dData.driver.trim()) {
      parsedCourier = dData.driver.trim();
    }
  }

  // customFields — только если delivery.data не дал результата
  if (!parsedCourier) {
    const cfCourier = cFields?.courier ?? cFields?.kurier;
    if (typeof cfCourier === "string" && cfCourier.trim()) {
      parsedCourier = cfCourier.trim();
    }
  }

  // delivery.service.name — НАМЕРЕННО НЕ используем: это не имя курьера

  const courier = parsedCourier || null;

  return {
    crmId: String(order.id),
    externalId: order.externalId ?? order.number ?? null,
    crmStatus: order.status ?? null,
    status: mapCrmStatus(order.status),
    address: order.delivery?.address?.text ?? null,
    deliveryDate: order.delivery?.date ?? null,
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

// ── Upsert order + notify ─────────────────────────────────
//
// Правила слияния (CRM — авторитет для "своих" полей, оператор — для "своих"):
//
//  CRM-поля (всегда перезаписываем из CRM):
//    crmStatus, status, items, comment, price, slot*, deliveryType, deliveryDate, crmCreatedAt, externalId
//
//  Оператор-поля (НИКОГДА не затираем, если уже заполнены):
//    courier   — оператор назначил вручную; в CRM может не быть
//    opComment — комментарий оператора, CRM не знает
//    address   — если geocoded=true, значит мы его уже исправили
//    lat/lng/geocoded/isInvalid/invalidReason — геокод наш, CRM не трогает

export async function upsertOrder(crmOrder: CrmOrder) {
  const data = mapCrmOrder(crmOrder);

  const existing = await prisma.order.findUnique({
    where: { crmId: data.crmId },
  });

  // ── Строим финальный объект для UPDATE ──
  const updateFields: typeof data & {
    lat?: number | null;
    lng?: number | null;
    geocoded?: boolean;
    isInvalid?: boolean;
    invalidReason?: string | null;
    courierManual?: boolean;
    changedAt?: Date;
  } = { ...data };

  if (existing) {
    // 1. Курьер
    if (existing.courierManual) {
      updateFields.courier = existing.courier;
      updateFields.courierManual = true;
    } else {
      if (!data.courier && existing.courier) {
        updateFields.courier = existing.courier;
      }
    }

    // 2. Комментарий оператора — только наш
    if (existing.opComment) {
      updateFields.opComment = existing.opComment;
    }

    // 3. Адрес + геокод — если мы уже геокодировали/исправили, не затираем CRM-сырым
    if (existing.geocoded) {
      updateFields.address       = existing.address;
      updateFields.lat           = existing.lat;
      updateFields.lng           = existing.lng;
      updateFields.geocoded      = true;
      updateFields.isInvalid     = existing.isInvalid;
      updateFields.invalidReason = existing.invalidReason;
    }

    // 4. changedAt — обновляем только если реально изменились значимые поля
    //    (статус, курьер, адрес, состав заказа). CRON-прогоны без изменений не трогают это поле.
    const meaningfullyChanged =
      existing.status  !== updateFields.status  ||
      existing.courier !== updateFields.courier ||
      existing.address !== updateFields.address ||
      existing.items   !== updateFields.items   ||
      existing.slotFrom !== updateFields.slotFrom;

    if (meaningfullyChanged) {
      updateFields.changedAt = new Date();
    }
  }

  const order = await prisma.order.upsert({
    where: { crmId: data.crmId },
    update: updateFields,
    create: { ...data, isInvalid: false, geocoded: false, courierManual: false, changedAt: new Date() },
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
  } catch (_) {
    return null;
  }
}

export async function geocodeNewOrders() {
  const orders = await prisma.order.findMany({
    where: { geocoded: false, address: { not: null } },
    take: 20,
  });
  if (orders.length === 0) return;

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
          lat: geo.lat,
          lng: geo.lng,
          geocoded: true,
          isInvalid: false,
          status: order.status === OrderStatus.NEW ? OrderStatus.GEOCODED : order.status,
        },
      });
    } catch (_) {
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

  const dateFrom = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString().split("T")[0];
  console.log(`[CRM Poll] Синхронизация начиная с ${dateFrom}`);

  let page = 1;
  let hasMore = true;
  let total = 0;

  while (hasMore) {
    const res = await axios.get<CrmOrdersResponse>(`${CRM_URL}/api/v5/orders`, {
      params: {
        apiKey: CRM_KEY,
        "filter[createdAtFrom]": dateFrom,
        limit: 100,
        page,
      },
      timeout: 15_000,
    });

    const { orders = [], pagination } = res.data;
    total += orders.length;

    // Neon HTTP: нет пула коннектов, но идём последовательно
    // чтобы не перегрузить serverless-инстанс при большом количестве заказов
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

  geocodeNewOrders().catch(console.error);
  console.log(`[CRM Poll] Готово — обработано ${total} заказов`);
}

// ── Update order in CRM ────────────────────────────────────
//
// Вызывается из PATCH /api/orders/[id] когда оператор меняет статус/курьера.
// Убедитесь что роут вызывает эту функцию:
//
//   import { updateCrmOrder } from "@/lib/crm";
//   ...
//   // после prisma.order.update(...)
//   await updateCrmOrder(order.crmId, { status: body.status, courier: body.courier });
//
export async function updateCrmOrder(
  crmId: string,
  data: { status?: OrderStatus; courier?: string }
) {
  if (!CRM_URL || !CRM_KEY) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderPayload: any = {};

  if (data.status && STATUS_TO_CRM[data.status]) {
    orderPayload.status = STATUS_TO_CRM[data.status];
  }

  if (data.courier !== undefined) {
    // Пишем и в customFields, и в delivery.data на случай разных настроек CRM
    orderPayload.customFields = {
      courier: data.courier || "",
      kurier:  data.courier || "",
    };
  }

  if (Object.keys(orderPayload).length === 0) {
    console.log(`[CRM] Нет данных для отправки в CRM для заказа ${crmId}`);
    return;
  }

  const params = new URLSearchParams();
  params.append("apiKey", CRM_KEY);
  params.append("order", JSON.stringify(orderPayload));

  try {
    const resp = await axios.post(
      `${CRM_URL}/api/v5/orders/${crmId}/edit`,
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5000,
      }
    );
    console.log(`[CRM] Заказ ${crmId} обновлён:`, resp.data?.success ? "OK" : resp.data);
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error && "response" in err
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err as any).response?.data
        : err instanceof Error
        ? err.message
        : "Unknown error";
    console.error(`[CRM] Ошибка обновления заказа ${crmId}:`, errorMsg);
  }
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
    time?: unknown;
    date?: string;
    cost?: number;
    code?: string;
    address?: { text?: string };
    service?: { name?: string; code?: string };
    data?: unknown;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customFields?: any;
}

interface CrmOrdersResponse {
  orders: CrmOrder[];
  pagination: {
    currentPage: number;
    totalPageCount: number;
  };
}