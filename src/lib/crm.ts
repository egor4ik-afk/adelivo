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
  console.log("[parseSlot] raw =", JSON.stringify(raw)); 
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

// 🔥 Формула для расчета расстояния по прямой между двумя координатами (в километрах)
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Радиус Земли
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; 
}

export async function geocodeAddress(address: string) {
  if (!GEO_KEY || !address) return null;
  try {
    // 🔥 Если менеджер не написал город, принудительно ищем в Московском регионе
    const searchAddress = address.toLowerCase().includes("москва") 
      ? address 
      : `Москва, ${address}`;

    const res = await axios.get("https://geocode-maps.yandex.ru/1.x/", {
      params: { apikey: GEO_KEY, geocode: searchAddress, format: "json", results: 1, ll: "37.6175,55.7520", spn: "1.0,1.0" },
      timeout: 5000,
    });
    
    const members = res.data?.response?.GeoObjectCollection?.featureMember ?? [];
    if (!members.length) return null;
    
    const point = members[0]?.GeoObject?.Point?.pos;
    if (!point) return null;
    
    const [lng, lat] = point.split(" ").map(Number);
    const precision = members[0]?.GeoObject?.metaDataProperty?.GeocoderMetaData?.precision;
    
    // 🔥 Координаты базы (откуда считаем расстояние). По умолчанию центр Москвы
    const BASE_LAT = 55.755864; 
    const BASE_LNG = 37.617698;
    const distanceKm = getDistanceFromLatLonInKm(BASE_LAT, BASE_LNG, lat, lng);

    return { 
      lat, 
      lng, 
      precision, 
      isExact: ["exact", "number", "near", "range"].includes(precision),
      distanceKm // Возвращаем посчитанное расстояние
    };
  } catch (_) { return null; }
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

      // 🔥 ПРОВЕРКА РАДИУСА (Максимум 75 км от центра/базы)
      const MAX_ALLOWED_RADIUS_KM = 75; 
      if (geo.distanceKm > MAX_ALLOWED_RADIUS_KM) {
        const reason = `Вне зоны доставки (найдено в ${Math.round(geo.distanceKm)} км от МСК)`;
        
        // Оставляем координаты (чтобы логист на карте видел, куда улетела точка), но помечаем как ОШИБКУ
        await prisma.order.update({ 
          where: { id: order.id }, 
          data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: true, invalidReason: reason } 
        });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason });
        continue;
      }

      if (!geo.isExact) {
        await prisma.order.update({ where: { id: order.id }, data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: true, invalidReason: `Неточный геокод: ${geo.precision}` } });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: `Неточный геокод: ${geo.precision}` });
        continue;
      }

      // Если всё идеально (близко и точно)
      await prisma.order.update({ where: { id: order.id }, data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: false, invalidReason: null } });
    } catch (_) {
      await prisma.order.update({ where: { id: order.id }, data: { geocoded: true, isInvalid: true, invalidReason: "Ошибка геокодирования" } }).catch(() => {});
    }
  }

  if (invalidOrders.length > 0) {
    notify({ type: "address.invalid", orders: invalidOrders }).catch(console.error);
  }
}

export async function upsertOrder(crmOrder: CrmOrder) {
  const data = await mapCrmOrder(crmOrder);

  // 🔥 ПЕРЕХВАТ НА ЛЕТУ: Накидываем 100₽ для авто-курьеров ДО сохранения в базу.
  // Если CRM пришлет пустоту (null) — этот блок просто не сработает, и в базу запишется null.
  if (data.courierId && data.price) {
    const assignedCourier = await prisma.courier.findUnique({
      where: { id: data.courierId },
      select: { isAuto: true },
    });
    
    if (assignedCourier?.isAuto) {
      const basePrices = [500, 900, 1300]; // 🔥 Убрали 1400, чтобы избежать двойной наценки
      if (basePrices.includes(data.price)) {
        data.price += 100; // Превращаем 500->600, 900->1000, 1300->1400
      }
    }
  }

  const existing = await prisma.order.findUnique({ where: { crmId: data.crmId } });

  const updateFields: typeof data & {
    lat?: number | null; lng?: number | null;
    geocoded?: boolean; isInvalid?: boolean; invalidReason?: string | null;
    changedAt?: Date;
    routeId?: string | null;    
    routeOrder?: number | null; 
    pickedUpAt?: Date | null; // 🔥 ДОБАВЛЕНО
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
    
    // 🔥 ЗАЩИТА ЦЕНЫ ОТ СБРОСА ИЗ CRM
    // Если у заказа в нашей БД уже установлена цена (руками или при назначении авто-курьера),
    // мы игнорируем цену, пришедшую из RetailCRM.
    if (existing.price !== null) {
      updateFields.price = existing.price;
    }

    // Если статус перевели "В пути", а время выезда еще пустое — ставим текущее
    if (updateFields.status === OrderStatus.IN_DELIVERY && existing.status !== OrderStatus.IN_DELIVERY) {
      if (!existing.pickedUpAt) {
        updateFields.pickedUpAt = new Date();
      }
    }
    // Если откатили статус обратно на Новые/Назначен — очищаем время
    if ((updateFields.status === OrderStatus.NEW || updateFields.status === OrderStatus.ASSIGNED) && existing.status !== updateFields.status) {
      updateFields.pickedUpAt = null;
    }

    const isCancelledOrReturned = updateFields.status === OrderStatus.CANCELLED || updateFields.status === OrderStatus.RETURNED;
    const isPickup = updateFields.address?.toLowerCase().includes("самовывоз");

    if (isCancelledOrReturned || isPickup) {
      if (existing.routeId && updateFields.routeId !== null) {
        const siblingsCount = await prisma.order.count({
          where: { routeId: existing.routeId, id: { not: existing.id } },
        });
        if (siblingsCount === 0) {
          await prisma.route.deleteMany({ where: { id: existing.routeId } });
        }
        updateFields.routeId = null;
        updateFields.routeOrder = null;
      }
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
      recipientPhoneChanged: (existing.recipientPhone ?? "") !== (order.recipientPhone ?? ""),
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
    recipientPhone?: string;
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

  if (data.recipientPhone !== undefined) {
    orderPayload.phone = data.recipientPhone.replace(/[^\d+]/g, "");
  }

  if (data.courier !== undefined) {
    const courierName = data.courier?.trim() || "";
    orderPayload.delivery = orderPayload.delivery ?? {};
    orderPayload.delivery.code = "logisty";

    if (courierName) {
      const courierId = await resolveCourierId(courierName);
      if (courierId) {
        orderPayload.delivery.data = { id: courierId, courierId: courierId, courier: courierId };
      }
      orderPayload.customFields = { courier: courierName, kurier: courierName };
    } else {
      const resetParams = new URLSearchParams();
      resetParams.append("apiKey", CRM_KEY);
      resetParams.append("order", JSON.stringify({ delivery: { code: "self-delivery" } }));
      resetParams.append("by", "id");
      await axios.post(
        `${CRM_URL}/api/v5/orders/${crmId}/edit`,
        resetParams.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000 }
      ).catch(() => {});

      orderPayload.delivery = { code: "logisty", typeId: 5 };
      orderPayload.customFields = { courier: null, kurier: null };
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

// 🔥 ДОБАВЛЕНА НОВАЯ ФУНКЦИЯ: Обновление стоимости доставки в CRM
// src/lib/crm.ts
export async function updateCrmOrderDeliveryPrice(crmId: string, basePrice: number) {
  if (!CRM_URL || !CRM_KEY) return;

  const NET_COST_MAP: Record<number, number> = {
    500: 732,
    600: 838,
    900: 1157,
    1000: 1264,
    1300: 1583,
    1400: 1689,
  };

  // Берем себестоимость по таблице, если нет - передаем саму цену
  const calculatedNetCost = NET_COST_MAP[basePrice] || basePrice;

  // Отправляем ТОЛЬКО себестоимость!
  const orderPayload = {
    delivery: { 
      netCost: calculatedNetCost 
    }
  };

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
    console.log(`[CRM] Себестоимость заказа ${crmId} обновлена на ${calculatedNetCost} ₽ (наша цена: ${basePrice})`);
  } catch (err: any) {
    console.error(`[CRM] Ошибка обновления себестоимости:`, err?.response?.data ?? err.message);
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