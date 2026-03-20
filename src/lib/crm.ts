// src/lib/crm.ts
import axios from "axios";
import { prisma } from "./prisma";
import { notify } from "./notifications";
import { OrderStatus } from "@prisma/client";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;
const GEO_KEY = process.env.YANDEX_GEOCODER_KEY;

// Ищем ID в локальной базе по имени
async function resolveCourierId(name: string): Promise<number | null> {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  const allCouriers = await prisma.courier.findMany();
  const match = allCouriers.find(c => c.fullName.toLowerCase().includes(normalized));
  return match ? match.id : null;
}

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

const CRM_STATUS_MAP: Record<string, OrderStatus> = {
  "new": OrderStatus.NEW, "accepted": OrderStatus.ASSIGNED, "send-to-assembling": OrderStatus.ASSIGNED,
  "assembling": OrderStatus.ASSIGNED, "assembling-complete": OrderStatus.ASSIGNED, "kurer-naznachen": OrderStatus.ASSIGNED,
  "send-to-delivery": OrderStatus.IN_DELIVERY, "delivering": OrderStatus.IN_DELIVERY, "complete": OrderStatus.DELIVERED,
  "cancel-other": OrderStatus.CANCELLED, "return": OrderStatus.RETURNED, "chastichnyi-vozvrat": OrderStatus.RETURNED,
};

export function mapCrmStatus(crmStatus?: string): OrderStatus {
  if (!crmStatus) return OrderStatus.NEW;
  return CRM_STATUS_MAP[crmStatus] ?? OrderStatus.NEW;
}
const STATUS_TO_CRM: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.ASSIGNED]: "kurer-naznachen", [OrderStatus.IN_DELIVERY]: "delivering",
  [OrderStatus.DELIVERED]: "complete", [OrderStatus.RETURNED]: "return", [OrderStatus.CANCELLED]: "cancel-other",
};

// 🔥 ИСПРАВЛЕНИЕ: Асинхронный маппер, который ищет имя по ID и возвращает courierId
export async function mapCrmOrder(order: CrmOrder) {
  const slot = parseSlot(order.delivery?.time);
  const items = order.items?.map(i => {
    const name = i.offer?.displayName ?? i.offer?.name ?? i.productName ?? "?";
    return (i.initialPrice ?? 0) > 0 ? `${name} — ${i.initialPrice}₽, ${i.quantity ?? 1}шт` : `${name} — ${i.quantity ?? 1}шт`;
  }).join("; ");

  let dData = order.delivery?.data as any;
  const cFields = (order as any).customFields as any;
  if (typeof dData === "string") { try { dData = JSON.parse(dData); } catch (_) {} }

  let parsedCourier: string | null = null;
  let finalCourierId: number | null = null;

  // 1. ИЩЕМ КУРЬЕРА ПО ID В БАЗЕ (Для Logisty)
  if (dData && dData.courier) {
    if (typeof dData.courier === 'number') finalCourierId = dData.courier;
    else if (typeof dData.courier === 'string' && !isNaN(Number(dData.courier))) finalCourierId = Number(dData.courier);
    else if (dData.courier.id) finalCourierId = Number(dData.courier.id);
  }

  // Фолбэки, если ID нет, пытаемся достать имя из других полей
  if (!finalCourierId && dData) {
    if (dData.firstName || dData.lastName) parsedCourier = [dData.firstName, dData.lastName].filter(Boolean).join(" ");
    else if (dData.courier?.name) parsedCourier = dData.courier.name;
    else if (typeof dData.courier === "string" && dData.courier.trim()) parsedCourier = dData.courier.trim();
  }
  if (!finalCourierId && !parsedCourier && order.delivery && (order.delivery as any).courier) {
    const dc = (order.delivery as any).courier;
    if (typeof dc === "object") parsedCourier = [dc.firstName, dc.lastName].filter(Boolean).join(" ") || dc.name || null;
    else if (typeof dc === "string") parsedCourier = dc.trim();
  }
  if (!finalCourierId && !parsedCourier) {
    const cfCourier = cFields?.courier ?? cFields?.kurier;
    if (typeof cfCourier === "string" && cfCourier.trim()) parsedCourier = cfCourier.trim();
  }

  // 🔥 САМОЕ ВАЖНОЕ: Если у нас есть ID, жестко тянем имя из нашей базы
  if (finalCourierId) {
    const dbCourier = await prisma.courier.findUnique({ where: { id: finalCourierId } });
    if (dbCourier) {
      parsedCourier = dbCourier.fullName;
    }
  } 
  // Если у нас есть ИМЯ (попало из фолбэка), но нет ID, пытаемся найти ID в базе по имени
  else if (parsedCourier) {
    const resolvedId = await resolveCourierId(parsedCourier);
    if (resolvedId) finalCourierId = resolvedId;
  }

  let parsedDate = null;
  if (order.createdAt) {
    const isoDate = order.createdAt.replace(" ", "T") + "+03:00";
    parsedDate = new Date(isoDate);
  }

  return {
    crmId: String(order.id), 
    externalId: order.externalId ?? order.number ?? null,
    crmStatus: order.status ?? null, 
    status: mapCrmStatus(order.status),
    address: order.delivery?.address?.text ?? null, 
    deliveryDate: order.delivery?.date ?? null,
    
    // 🔥 ВОЗВРАЩАЕМ И КЛЮЧ И ТЕКСТ
    courierId: finalCourierId || null,
    courier: parsedCourier || null, 
    
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

export async function upsertOrder(crmOrder: CrmOrder) {
  const data = await mapCrmOrder(crmOrder);
  const existing = await prisma.order.findUnique({ where: { crmId: data.crmId } });

  const updateFields: typeof data & { lat?: number | null; lng?: number | null; geocoded?: boolean; isInvalid?: boolean; invalidReason?: string | null; courierManual?: boolean; changedAt?: Date; } = { ...data };

  if (existing) {
    if (existing.courierManual) { 
      updateFields.courier = existing.courier; 
      updateFields.courierId = existing.courierId; // Сохраняем и ID
      updateFields.courierManual = true; 
    } 
    else { 
      if (!data.courier && existing.courier) {
        updateFields.courier = existing.courier;
        updateFields.courierId = existing.courierId;
      }
    }
    if (existing.opComment) updateFields.opComment = existing.opComment;
    if (existing.geocoded) {
      updateFields.address = existing.address; updateFields.lat = existing.lat; updateFields.lng = existing.lng;
      updateFields.geocoded = true; updateFields.isInvalid = existing.isInvalid; updateFields.invalidReason = existing.invalidReason;
    }
    
    // 🔥 Добавили проверку по courierId
    const meaningfullyChanged = 
      (existing.crmStatus ?? "") !== (updateFields.crmStatus ?? "") || 
      (existing.courierId ?? 0) !== (updateFields.courierId ?? 0) || 
      (existing.courier ?? "") !== (updateFields.courier ?? "") || 
      (existing.address ?? "") !== (updateFields.address ?? "") || 
      (existing.items ?? "") !== (updateFields.items ?? "") || 
      (existing.slotFrom ?? "") !== (updateFields.slotFrom ?? "") || 
      (existing.slotTo ?? "") !== (updateFields.slotTo ?? "") || 
      (existing.price ?? 0) !== (updateFields.price ?? 0);
      
    if (meaningfullyChanged) updateFields.changedAt = new Date();
  }

  const order = await prisma.order.upsert({
    where: { crmId: data.crmId }, update: updateFields,
    create: { ...data, isInvalid: false, geocoded: false, courierManual: false },
  });

  if (!existing) { notify({ type: "order.new", order }).catch(console.error); } 
  else {
    const changes = [];
    if (existing.status !== order.status) changes.push(`Статус: ${existing.status} -> ${order.status}`);
    
    // Уведомляем о смене курьера более умно
    if (existing.courier !== order.courier) {
      changes.push(`Курьер: ${order.courier || 'Сброшен'}`);
    }

    if (existing.address !== order.address) changes.push(`Адрес изменен`);
    if (existing.slotRaw !== order.slotRaw) changes.push(`Время: ${order.slotRaw}`);
    
    if (changes.length > 0) notify({ type: "order.updated", order, previousStatus: existing.status !== order.status ? existing.status : undefined }).catch(console.error);
  }
  return order;
}

export async function geocodeAddress(address: string) {
  if (!GEO_KEY || !address) return null;
  try {
    const res = await axios.get("https://geocode-maps.yandex.ru/1.x/", { params: { apikey: GEO_KEY, geocode: address, format: "json", results: 1, ll: "37.6175,55.7520", spn: "1.0,1.0" }, timeout: 5000 });
    const members = res.data?.response?.GeoObjectCollection?.featureMember ?? [];
    if (!members.length) return null;
    const point = members[0]?.GeoObject?.Point?.pos;
    if (!point) return null;
    const [lng, lat] = point.split(" ").map(Number);
    const precision = members[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.precision;
    return { lat, lng, precision, isExact: ["exact", "number", "near", "range"].includes(precision) };
  } catch (_) { return null; }
}

export async function geocodeNewOrders() {
  const orders = await prisma.order.findMany({ where: { geocoded: false, address: { not: null } }, take: 20 });
  if (orders.length === 0) return;
  const invalidOrders: Array<{ externalId: string | null; address: string | null; reason: string }> = [];
  for (const order of orders) {
    if (!order.address) continue;
    try {
      const geo = await geocodeAddress(order.address);
      if (!geo) {
        await prisma.order.update({ where: { id: order.id }, data: { geocoded: true, isInvalid: true, invalidReason: "Адрес не найден", status: OrderStatus.INVALID_ADDRESS } });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: "Адрес не найден" });
        continue;
      }
      if (!geo.isExact) {
        await prisma.order.update({ where: { id: order.id }, data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: true, invalidReason: `Неточный геокод: ${geo.precision}`, status: OrderStatus.INVALID_ADDRESS } });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: `Неточный геокод: ${geo.precision}` });
        continue;
      }
      await prisma.order.update({ where: { id: order.id }, data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: false, status: order.status === OrderStatus.NEW ? OrderStatus.GEOCODED : order.status } });
    } catch (_) {
      await prisma.order.update({ where: { id: order.id }, data: { geocoded: true, isInvalid: true, invalidReason: "Ошибка геокодирования", status: OrderStatus.INVALID_ADDRESS } }).catch(() => {});
    }
  }
  if (invalidOrders.length > 0) notify({ type: "address.invalid", orders: invalidOrders }).catch(console.error);
}

export async function pollCrmOrders() {
  if (!CRM_URL || !CRM_KEY) return;
  const dateFrom = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString().split("T")[0];
  let page = 1; let hasMore = true;
  while (hasMore) {
    const res = await axios.get<CrmOrdersResponse>(`${CRM_URL}/api/v5/orders`, { params: { apiKey: CRM_KEY, "filter[createdAtFrom]": dateFrom, limit: 100, page }, timeout: 15_000 });
    const { orders = [], pagination } = res.data;
    for (const order of orders) await upsertOrder(order);
    hasMore = pagination?.currentPage < pagination?.totalPageCount;
    page++;
  }
  await prisma.syncState.upsert({ where: { id: 1 }, update: { lastSyncAt: new Date() }, create: { id: 1, lastSyncAt: new Date() } });
  geocodeNewOrders().catch(console.error);
}

// 🔥 ИСПРАВЛЕНИЕ ОТПРАВКИ: Строго передаем код доставки и ID
export async function updateCrmOrder(crmId: string, data: { status?: OrderStatus; courier?: string; opComment?: string; address?: string; deliveryType?: string | null }) {
  if (!CRM_URL || !CRM_KEY) return;
  const orderPayload: any = {};
  if (data.status && STATUS_TO_CRM[data.status]) orderPayload.status = STATUS_TO_CRM[data.status];
  if (data.opComment !== undefined) orderPayload.managerComment = data.opComment;

  let deliveryUpdates: any = null;
  if (data.address !== undefined) {
    deliveryUpdates = deliveryUpdates || {};
    deliveryUpdates.address = { text: data.address };
  }

  if (data.courier !== undefined) {
    const courierName = data.courier.trim();
    deliveryUpdates = deliveryUpdates || {};
    
    if (courierName) {
      const courierId = await resolveCourierId(courierName);
      if (courierId) {
        // Записываем прямо в интеграционные данные Logisty
        deliveryUpdates.data = { courier: courierId }; 
      }
    } else {
      deliveryUpdates.data = null; 
    }
    
    // ВАЖНО: передаем тип доставки "5" или "logisty", иначе CRM не пустит
    if (data.deliveryType) {
      deliveryUpdates.code = data.deliveryType; 
    }
    orderPayload.customFields = { courier: courierName, kurier: courierName };
  }

  if (deliveryUpdates) orderPayload.delivery = deliveryUpdates;
  if (Object.keys(orderPayload).length === 0) return;

  const params = new URLSearchParams();
  params.append("apiKey", CRM_KEY);
  params.append("order", JSON.stringify(orderPayload));
  params.append("by", "id"); 

  try {
    const resp = await axios.post(`${CRM_URL}/api/v5/orders/${crmId}/edit`, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000 });
    console.log(`[CRM] Обновлен заказ ${crmId} в RetailCRM:`, resp.data?.success ? "УСПЕХ" : resp.data);
  } catch (err: any) {
    console.error(`[CRM] Ошибка обновления заказа ${crmId}:`, err?.response?.data || err.message);
  }
}

export interface CrmOrder {
  id: number; number?: string; externalId?: string; status?: string; createdAt?: string; customerComment?: string; managerComment?: string; firstName?: string; lastName?: string;
  delivery?: { time?: unknown; date?: string; cost?: number; code?: string; address?: { text?: string }; service?: { name?: string; code?: string }; data?: unknown; courier?: unknown; };
  items?: Array<{ productName?: string; quantity?: number; initialPrice?: number; offer?: { name?: string; displayName?: string; }; }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customFields?: any;
}
interface CrmOrdersResponse { orders: CrmOrder[]; pagination: { currentPage: number; totalPageCount: number; }; }