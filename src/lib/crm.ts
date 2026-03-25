// src/lib/crm.ts
import axios from "axios";
import { prisma } from "./prisma";
import { notify } from "./notifications";
import { OrderStatus } from "@prisma/client";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;
const GEO_KEY = process.env.YANDEX_GEOCODER_KEY;

async function resolveCourierId(name: string): Promise<number | null> {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  const allCouriers = await prisma.courier.findMany();
  const match = allCouriers.find(c => c.fullName.toLowerCase().includes(normalized));
  return match ? match.id : null;
}

export function parseSlot(raw: unknown) {
  console.log("[parseSlot] raw =", JSON.stringify(raw)); // ← добавь
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

const CRM_STATUS_MAP: Record<string, OrderStatus> = {
  "new": OrderStatus.NEW, "accepted": OrderStatus.ASSIGNED,
  "send-to-assembling": OrderStatus.ASSIGNED, "assembling": OrderStatus.ASSIGNED,
  "assembling-complete": OrderStatus.ASSIGNED, "kurer-naznachen": OrderStatus.ASSIGNED,
  "send-to-delivery": OrderStatus.IN_DELIVERY, "delivering": OrderStatus.IN_DELIVERY,
  "complete": OrderStatus.DELIVERED, "cancel-other": OrderStatus.CANCELLED,
  "return": OrderStatus.RETURNED, "chastichnyi-vozvrat": OrderStatus.RETURNED,
};

export function mapCrmStatus(crmStatus?: string): OrderStatus {
  if (!crmStatus) return OrderStatus.NEW;
  return CRM_STATUS_MAP[crmStatus] ?? OrderStatus.NEW;
}

const STATUS_TO_CRM: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.NEW]: "new",
  [OrderStatus.ASSIGNED]: "kurer-naznachen",
  [OrderStatus.IN_DELIVERY]: "send-to-delivery",
  [OrderStatus.DELIVERED]: "complete",
  [OrderStatus.RETURNED]: "return",
  [OrderStatus.CANCELLED]: "cancel-other",
};

function parseCourierFromDelivery(delivery: CrmOrder["delivery"]): { id: number | null; name: string | null } {
  if (!delivery) return { id: null, name: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = delivery as any;

  if (d.courier && typeof d.courier === "object" && d.courier.id) {
    const name = [d.courier.firstName, d.courier.lastName].filter(Boolean).join(" ") || d.courier.name || null;
    return { id: Number(d.courier.id), name };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dData = delivery.data as any;
  if (typeof dData === "string") {
    try { dData = JSON.parse(dData); } catch (_) { dData = null; }
  }

  if (dData?.id && typeof dData.id === "number" && dData.id > 0) {
    const name = dData.firstName ? String(dData.firstName) : null;
    return { id: dData.id, name };
  }
  if (dData?.courierId && typeof dData.courierId === "number" && dData.courierId > 0) {
    const name = dData.firstName ? String(dData.firstName) : null;
    return { id: dData.courierId, name };
  }

  if (dData?.courier !== undefined && dData.courier !== null && dData.courier !== "") {
    if (typeof dData.courier === "number" && dData.courier > 0) return { id: dData.courier, name: null };
    if (typeof dData.courier === "string" && !isNaN(Number(dData.courier)) && Number(dData.courier) > 0) return { id: Number(dData.courier), name: null };
    if (typeof dData.courier === "object" && dData.courier?.id) {
      const name = [dData.courier.firstName, dData.courier.lastName].filter(Boolean).join(" ") || null;
      return { id: Number(dData.courier.id), name };
    }
  }

  if (dData?.firstName || dData?.lastName) {
    return { id: null, name: [dData.firstName, dData.lastName].filter(Boolean).join(" ") };
  }

  return { id: null, name: null };
}

export async function mapCrmOrder(order: CrmOrder) {
  const slot = parseSlot(order.delivery?.time);
  const items = order.items?.map(i => {
    const name = i.offer?.displayName ?? i.offer?.name ?? i.productName ?? "?";
    // 🔥 ИЗМЕНЕНО: Оставляем только название и количество, убираем цену
    return `${name} — ${i.quantity ?? 1} шт`;
  }).join("; ");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cFields = (order as any).customFields as any;

  let parsedCourier: string | null = null;
  let finalCourierId: number | null = null;

  const courierFromDelivery = parseCourierFromDelivery(order.delivery);

  if (courierFromDelivery.id) {
    finalCourierId = courierFromDelivery.id;
    const dbCourier = await prisma.courier.findUnique({ where: { id: finalCourierId } });
    parsedCourier = dbCourier?.fullName ?? courierFromDelivery.name;
  } else if (courierFromDelivery.name) {
    parsedCourier = courierFromDelivery.name;
    finalCourierId = await resolveCourierId(parsedCourier);
  }

  if (!parsedCourier && !finalCourierId) {
    const cfCourier = cFields?.courier ?? cFields?.kurier;
    if (typeof cfCourier === "string" && cfCourier.trim()) {
      parsedCourier = cfCourier.trim();
      finalCourierId = await resolveCourierId(parsedCourier);
    }
  }

  let parsedDate = null;
  if (order.createdAt) {
    const isoDate = order.createdAt.replace(" ", "T") + (order.createdAt.includes("+") ? "" : "+03:00");
    const rawDate = new Date(isoDate);
    parsedDate = new Date(rawDate.getTime() - 5 * 60 * 60 * 1000);
  }

  return {
    crmId: String(order.id),
    externalId: order.externalId ?? order.number ?? null,
    crmStatus: order.status ?? null,
    status: mapCrmStatus(order.status),
    address: order.delivery?.address?.text ?? null,
    deliveryDate: order.delivery?.date ?? null,
    courierId: finalCourierId,
    courier: parsedCourier,
    price: order.delivery?.cost ?? null,
    comment: order.customerComment ?? null,
    opComment: order.managerComment ?? null,
    items: items ?? null,
    slotFrom: slot.from,
    slotTo: slot.to,
    slotRaw: slot.text,
    deliveryType: order.delivery?.code ?? null,
    crmCreatedAt: parsedDate,
  };
}

export async function geocodeNewOrders() {
  const orders = await prisma.order.findMany({ where: { geocoded: false, address: { not: null } }, take: 20 });
  if (orders.length === 0) return;

  const invalidOrders: Array<{ externalId: string | null; address: string | null; reason: string }> = [];

  for (const order of orders) {
    if (!order.address) continue;
    
    if (order.address.toLowerCase().includes("самовывоз")) {
      await prisma.order.update({ 
        where: { id: order.id }, 
        data: { geocoded: true, isInvalid: false } 
      });
      continue;
    }

    try {
      const geo = await geocodeAddress(order.address);
      if (!geo) {
        await prisma.order.update({ where: { id: order.id }, data: { geocoded: true, isInvalid: true, invalidReason: "Адрес не найден" } });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: "Адрес не найден" });
        continue;
      }
      if (!geo.isExact) {
        await prisma.order.update({ where: { id: order.id }, data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: true, invalidReason: `Неточный геокод: ${geo.precision}` } });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: `Неточный геокод: ${geo.precision}` });
        continue;
      }
      await prisma.order.update({ where: { id: order.id }, data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: false } });
    } catch (_) {
      await prisma.order.update({ where: { id: order.id }, data: { geocoded: true, isInvalid: true, invalidReason: "Ошибка геокодирования" } }).catch(() => {});
    }
  }

  if (invalidOrders.length > 0) {
    notify({ type: "address.invalid", orders: invalidOrders }).catch(console.error);
  }
}

export async function geocodeAddress(address: string) {
  if (!GEO_KEY || !address) return null;
  try {
    const res = await axios.get("https://geocode-maps.yandex.ru/1.x/", {
      params: { apikey: GEO_KEY, geocode: address, format: "json", results: 1, ll: "37.6175,55.7520", spn: "1.0,1.0" },
      timeout: 5000,
    });
    const members = res.data?.response?.GeoObjectCollection?.featureMember ?? [];
    if (!members.length) return null;
    const point = members[0]?.GeoObject?.Point?.pos;
    if (!point) return null;
    const [lng, lat] = point.split(" ").map(Number);
    const precision = members[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.precision;
    return { lat, lng, precision, isExact: ["exact", "number", "near", "range"].includes(precision) };
  } catch (_) { return null; }
}

export async function upsertOrder(crmOrder: CrmOrder) {
  const data = await mapCrmOrder(crmOrder);
  const existing = await prisma.order.findUnique({ where: { crmId: data.crmId } });

  const updateFields: typeof data & {
    lat?: number | null; lng?: number | null;
    geocoded?: boolean; isInvalid?: boolean; invalidReason?: string | null;
    changedAt?: Date;
  } = { ...data };

  if (existing) {
    const dbAddr = existing.address?.trim() || "";
    const crmAddr = data.address?.trim() || "";
  
    if (dbAddr !== crmAddr) {
      updateFields.address       = crmAddr || null;
      updateFields.geocoded      = false;
      updateFields.lat           = null;
      updateFields.lng           = null;
      updateFields.isInvalid     = false;
      updateFields.invalidReason = null;
    } else {
      updateFields.address       = existing.address;
      updateFields.lat           = existing.lat;
      updateFields.lng           = existing.lng;
      updateFields.geocoded      = existing.geocoded;
      updateFields.isInvalid     = existing.isInvalid;
      updateFields.invalidReason = existing.invalidReason;
    }
  
    if (data.status === OrderStatus.NEW && existing.status !== OrderStatus.NEW) {
      updateFields.status = existing.status;
    }

    const hasCoreChanges =
      (existing.crmStatus  ?? "") !== (updateFields.crmStatus  ?? "") ||
      (existing.courierId  ?? 0)  !== (updateFields.courierId  ?? 0)  ||
      (existing.courier    ?? "") !== (updateFields.courier    ?? "") ||
      (existing.items      ?? "") !== (updateFields.items      ?? "") ||
      (existing.slotFrom   ?? "") !== (updateFields.slotFrom   ?? "") ||
      (existing.slotTo     ?? "") !== (updateFields.slotTo     ?? "") ||
      (existing.price      ?? 0)  !== (updateFields.price      ?? 0)  ||
      dbAddr !== crmAddr; 

    if (hasCoreChanges) updateFields.changedAt = new Date();
  }

  const order = await prisma.order.upsert({
    where: { crmId: data.crmId },
    update: updateFields,
    create: { ...data, isInvalid: false, geocoded: false },
  });

  if (!existing) {
    notify({ type: "order.new", order }).catch(console.error);
  } else {
    const changes = {
      statusChanged:    (existing.crmStatus ?? "") !== (order.crmStatus ?? ""),
      courierChanged:   (existing.courierId ?? 0)  !== (order.courierId ?? 0),
      slotChanged:      (existing.slotRaw   ?? "") !== (order.slotRaw   ?? ""),
      addressChanged:   (existing.address   ?? "") !== (order.address   ?? ""),
      commentChanged:   (existing.comment   ?? "") !== (order.comment   ?? ""),
      opCommentChanged: (existing.opComment ?? "") !== (order.opComment ?? ""),
      itemsChanged:     (existing.items     ?? "") !== (order.items     ?? ""),
    };

    if (Object.values(changes).some(Boolean)) {
      notify({
        type: "order.updated",
        order,
        previousStatus: changes.statusChanged ? existing.status : undefined,
        changes
      }).catch(console.error);
    }
  }

  return order;
}

export async function pollCrmOrders() {
  if (!CRM_URL || !CRM_KEY) return;
  
  try {
    const dateFrom = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString().split("T")[0];
    const resNew = await axios.get<CrmOrdersResponse>(`${CRM_URL}/api/v5/orders`, {
      params: { apiKey: CRM_KEY, "filter[createdAtFrom]": dateFrom, limit: 100 },
      timeout: 15_000,
    });
    for (const order of resNew.data?.orders || []) await upsertOrder(order);

    const activeOrders = await prisma.order.findMany({
      where: { status: { notIn: ["DELIVERED", "CANCELLED", "RETURNED"] } },
      select: { crmId: true }
    });

    const activeIds = activeOrders.map(o => o.crmId);
    
    for (let i = 0; i < activeIds.length; i += 50) {
      const chunk = activeIds.slice(i, i + 50);
      const params = new URLSearchParams();
      params.append("apiKey", CRM_KEY);
      params.append("limit", "100");
      chunk.forEach(id => params.append("filter[ids][]", id));
      
      const resUpdate = await axios.get<CrmOrdersResponse>(`${CRM_URL}/api/v5/orders?${params.toString()}`, { timeout: 15_000 });
      for (const order of resUpdate.data?.orders || []) await upsertOrder(order);
    }

    await prisma.syncState.upsert({ where: { id: 1 }, update: { lastSyncAt: new Date() }, create: { id: 1, lastSyncAt: new Date() } });
    
    geocodeNewOrders().catch(console.error);
  } catch (err) {
    console.error("[Cron] Error polling CRM:", err);
  }
}

export async function updateCrmOrder(
  crmId: string,
  data: { 
    status?: OrderStatus; 
    courier?: string; 
    opComment?: string; 
    address?: string; 
    deliveryType?: string | null;
    recipientPhone?: string; // 🔥 Добавили поле
  }
) {
  if (!CRM_URL || !CRM_KEY) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderPayload: any = {};

  if (data.status && STATUS_TO_CRM[data.status]) orderPayload.status = STATUS_TO_CRM[data.status];
  if (data.opComment !== undefined) orderPayload.managerComment = data.opComment;
  if (data.address !== undefined) {
    orderPayload.delivery = orderPayload.delivery ?? {};
    orderPayload.delivery.address = { text: data.address };
  }

  // 🔥 ДОБАВЛЯЕМ ОБРАБОТКУ ТЕЛЕФОНА
  if (data.recipientPhone !== undefined) {
    // Очищаем маску: "+7 (999) 123-45-67" превратится в "+79991234567"
    orderPayload.phone = data.recipientPhone.replace(/[^\d+]/g, "");
  }

  if (data.courier !== undefined) {
    const courierName = data.courier.trim();
    orderPayload.delivery = orderPayload.delivery ?? {};
    orderPayload.delivery.code = "logisty";

    if (courierName) {
      const courierId = await resolveCourierId(courierName);
      if (courierId) {
        orderPayload.delivery.data = { id: courierId, courierId: courierId, courier: courierId };
      }
      orderPayload.customFields = { courier: courierName, kurier: courierName };
    } else {
      orderPayload.delivery.data = { id: "", courierId: "", courier: "" };
      orderPayload.customFields = { courier: "", kurier: "" };
    }
  }

  

  if (Object.keys(orderPayload).length === 0) return;

  const params = new URLSearchParams();
  params.append("apiKey", CRM_KEY);
  params.append("order", JSON.stringify(orderPayload));
  params.append("by", "id");

  try {
    await axios.post(
      `${CRM_URL}/api/v5/orders/${crmId}/edit`,
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000 }
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error(`[CRM] Ошибка обновления заказа ${crmId}:`, err?.response?.data ?? err.message);
  }
}

export interface CrmOrder {
  id: number; number?: string; externalId?: string; status?: string;
  createdAt?: string; customerComment?: string; managerComment?: string;
  firstName?: string; lastName?: string;
  phone?: string; email?: string;
  customer?: {
    firstName?: string; lastName?: string;
    phones?: Array<{number?: string}>;
    email?: string;
  };
  delivery?: {
    time?: unknown; date?: string; cost?: number; code?: string;
    address?: { text?: string };
    service?: { name?: string; code?: string };
    data?: unknown;
    courier?: unknown;
  };
  items?: Array<{
    productName?: string; quantity?: number; initialPrice?: number;
    offer?: { name?: string; displayName?: string };
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customFields?: any;
}

interface CrmOrdersResponse {
  orders: CrmOrder[];
  pagination: { currentPage: number; totalPageCount: number };
}