// src/lib/crm.ts
import axios from "axios";
import fs from "fs";
import { prisma } from "./prisma";
import { notify } from "./notifications";
import { OrderStatus } from "@prisma/client";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY; 
const CRM_KEY_MEURA = process.env.RETAILCRM_API_KEY_MEURA; // 🔥 Добавили
const GEO_KEY = process.env.YANDEX_GEOCODER_KEY;

// 🔥 БРОНЕЖИЛЕТ ДЛЯ MEURA
const MEURA_SHOPS = ['kaktusfiori', 'meura-flowers'];

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

// 🔥 УМНЫЙ ПАРСЕР АДРЕСА (вырезает Имя и Телефон)
function parseMeuraAddress(rawAddress: string | null) {
  if (!rawAddress) return { cleanAddress: null, name: null, phone: null };

  const phoneRegex = /(\+?[78][-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})/;
  const phoneMatch = rawAddress.match(phoneRegex);
  const phone = phoneMatch ? phoneMatch[1].replace(/[^\d+]/g, '') : null;

  let cleanAddress = rawAddress;
  let name = null;

  if (phoneMatch) {
    cleanAddress = cleanAddress.replace(phoneMatch[0], '');

    const parts = rawAddress.split(phoneMatch[0]);
    if (parts[1] && parts[1].trim()) {
       const tailMatch = parts[1].trim().match(/[А-ЯЁа-яёA-Za-z]+/);
       if (tailMatch) {
           name = tailMatch[0];
           cleanAddress = cleanAddress.replace(parts[1], '');
       }
    }
    
    if (!name) {
       const endNameRegex = /[\s,]+([А-ЯЁ][а-яёA-Za-z]+)\s*$/;
       const matchName = cleanAddress.match(endNameRegex);
       if (matchName && !['этаж', 'кв', 'подъезд', 'д'].includes(matchName[1].toLowerCase())) {
           name = matchName[1];
           cleanAddress = cleanAddress.replace(endNameRegex, '');
       }
    }
  }

  cleanAddress = cleanAddress.replace(/,\s*$/, '').trim();
  cleanAddress = cleanAddress.replace(/^,\s*/, '').trim(); 
  
  return { cleanAddress, name, phone };
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

  // 🔥 РАЗДЕЛЕНИЕ ЛОГИКИ ПО МАГАЗИНАМ
  const shopCode = order.site ?? null;
  const rawAddress = order.delivery?.address?.text ?? null;
  let finalAddress = rawAddress;
  let recipientName = null;
  let recipientPhone = null;

  if (shopCode === 'kaktusfiori' || shopCode === 'meura-flowers') {
    const parsed = parseMeuraAddress(rawAddress);
    finalAddress = parsed.cleanAddress;
    recipientName = parsed.name;
    recipientPhone = parsed.phone;
  }

  return {
    crmId: String(order.id),
    externalId: order.externalId ?? order.number ?? null,
    shop: shopCode,
    name: recipientName,
    recipientPhone: recipientPhone,
    crmStatus: order.status ?? null,
    status: mapCrmStatus(order.status),
    address: finalAddress,
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

// ─────────────────────────────────────────────────────────────────────────────
// ЗОНЫ KML
// ─────────────────────────────────────────────────────────────────────────────

interface Zone {
  name: string;
  polygon: [number, number][];
}

let _zonesCache: { zone0: Zone | null; zone10: Zone | null; zone20: Zone | null } | null = null;

function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [lng, lat] = point;
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

function loadZonesFromKml(): typeof _zonesCache {
  const kmlPath = "./public/zones.kml";
  if (!fs.existsSync(kmlPath)) {
    console.warn("[zones] zones.kml не найден:", kmlPath);
    return { zone0: null, zone10: null, zone20: null };
  }
  const kml = fs.readFileSync(kmlPath, "utf-8");
  const placemarks = kml.split("<Placemark>");
  const zones: Zone[] = [];

  for (let i = 1; i < placemarks.length; i++) {
    const p = placemarks[i];
    if (!p.includes("<Polygon>")) continue;

    const name = (p.match(/<n>(.*?)<\/name>/)?.[1] ?? "")
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim().toLowerCase();
    const desc = (p.match(/<description>(.*?)<\/description>/)?.[1] ?? "")
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim().toLowerCase();
    const zoneName = name || desc || "без названия";

    const coordsMatch = p.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/);
    if (!coordsMatch) continue;

    const points = coordsMatch[1].trim().split(/\s+/).map((pair) => {
      const [lng, lat] = pair.split(",").map(Number);
      return [lng, lat] as [number, number];
    }).filter(([lng, lat]) => !isNaN(lng) && !isNaN(lat));

    if (points.length > 3) zones.push({ name: zoneName, polygon: points });
  }

  return {
    zone0:  zones.find(z => z.name.startsWith("0"))  ?? null,
    zone10: zones.find(z => z.name.startsWith("10")) ?? null,
    zone20: zones.find(z => z.name.startsWith("20")) ?? null,
  };
}

function getZones(): { zone0: Zone | null; zone10: Zone | null; zone20: Zone | null } {
  if (!_zonesCache) _zonesCache = loadZonesFromKml();
  return _zonesCache ?? { zone0: null, zone10: null, zone20: null };
}

export function calcBaseDeliveryPrice(lat: number, lng: number): number {
  const distFromCenter = getDistanceFromLatLonInKm(55.755864, 37.617698, lat, lng);
  const distFromMkad = Math.max(distFromCenter - 17, 0);
  const { zone0, zone10, zone20 } = getZones();
  const pt: [number, number] = [lng, lat];

  if (zone0  && isPointInPolygon(pt, zone0.polygon))  return 500;
  if (zone10 && isPointInPolygon(pt, zone10.polygon)) return 900;
  if (zone20 && isPointInPolygon(pt, zone20.polygon)) return 1300;

  if (distFromMkad > 10) return 1300;
  if (distFromMkad > 0)  return 900;
  return 500;
}

// ─────────────────────────────────────────────────────────────────────────────
// ГЕОКОДИРОВАНИЕ
// ─────────────────────────────────────────────────────────────────────────────

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function geocodeAddress(address: string) {
  if (!GEO_KEY || !address) return null;
  try {
    const searchAddress = address.toLowerCase().includes("москва") ? address : `Москва, ${address}`;
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
    const distanceKm = getDistanceFromLatLonInKm(55.755864, 37.617698, lat, lng);
    return {
      lat, lng, precision,
      isExact: ["exact", "number", "near", "range"].includes(precision),
      distanceKm,
    };
  } catch (_) { return null; }
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

    if (order.address.toLowerCase().includes("самовывоз")) {
      await prisma.order.update({ where: { id: order.id }, data: { geocoded: true, isInvalid: false } });
      continue;
    }

    try {
      const geo = await geocodeAddress(order.address);

      if (!geo) {
        await prisma.order.update({ where: { id: order.id }, data: { geocoded: true, isInvalid: true, invalidReason: "Адрес не найден" } });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: "Адрес не найден" });
        continue;
      }

      if (geo.distanceKm > 75) {
        const reason = `Вне зоны доставки (найдено в ${Math.round(geo.distanceKm)} км от МСК)`;
        await prisma.order.update({ where: { id: order.id }, data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: true, invalidReason: reason } });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason });
        continue;
      }

      if (!geo.isExact) {
        await prisma.order.update({ where: { id: order.id }, data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: true, invalidReason: `Неточный геокод: ${geo.precision}` } });
        invalidOrders.push({ externalId: order.externalId, address: order.address, reason: `Неточный геокод: ${geo.precision}` });
        continue;
      }

      const basePrice = calcBaseDeliveryPrice(geo.lat, geo.lng);
      let finalPrice = basePrice;
      if (order.courierId) {
        const courier = await prisma.courier.findUnique({ where: { id: order.courierId }, select: { isAuto: true } });
        if (courier?.isAuto) finalPrice = basePrice + 100;
      }

      await prisma.order.update({
        where: { id: order.id },
        data: { lat: geo.lat, lng: geo.lng, geocoded: true, isInvalid: false, invalidReason: null, price: finalPrice },
      });

      const crmPrice = order.price ?? 0;
      if (crmPrice !== finalPrice) {
        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        if (tgToken) {
          const msg = [
            `⚠️ *Расхождение цены доставки*`,
            ``,
            `📦 *Заказ:* ${order.externalId || order.crmId}`,
            `💰 *Цена в CRM:* ${crmPrice} ₽`,
            `✅ *Фактическая цена доставки:* ${finalPrice} ₽`,
          ].join("\n");
          fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID, text: msg, parse_mode: "Markdown" }),
          }).catch(e => console.error("[TG] Ошибка уведомления о цене:", e));
        }
      }

    } catch (_) {
      await prisma.order.update({
        where: { id: order.id },
        data: { geocoded: true, isInvalid: true, invalidReason: "Ошибка геокодирования" },
      }).catch(() => {});
    }
  }

  if (invalidOrders.length > 0) {
    notify({ type: "address.invalid", orders: invalidOrders }).catch(console.error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPSERT ЗАКАЗА
// ─────────────────────────────────────────────────────────────────────────────

// ПАТЧ для src/lib/crm.ts
// Заменить ТОЛЬКО функцию upsertOrder — остальное не трогать
// 
// Исправления:
// 1. recipientPhoneChanged добавлен в changes (был убран в v6)
// 2. hasCoreChanges теперь включает recipientPhoneChanged
// 3. Защита от дублей webhook: сравниваем crmStatus ДО перезаписи updateFields

export async function upsertOrder(crmOrder: CrmOrder) {
  const data = await mapCrmOrder(crmOrder);

  const existing = await prisma.order.findUnique({ where: { crmId: data.crmId } });

  const updateFields: typeof data & {
    lat?: number | null; lng?: number | null;
    geocoded?: boolean; isInvalid?: boolean; invalidReason?: string | null;
    changedAt?: Date;
    routeId?: string | null;
    routeOrder?: number | null;
    pickedUpAt?: Date | null;
  } = { ...data };

  if (existing) {
    // 🔥 БРОНЯ полей
    if (!updateFields.name && existing.name) updateFields.name = existing.name;
    if (!updateFields.recipientPhone && existing.recipientPhone) updateFields.recipientPhone = existing.recipientPhone;
    if (!updateFields.shop && existing.shop) updateFields.shop = existing.shop;

    const dbAddr  = existing.address?.trim() || "";
    const crmAddr = (data.address ?? "").trim();  // берём из data, не из updateFields

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

    // АБСОЛЮТНАЯ ЗАЩИТА ЦЕНЫ
    if (existing.price && existing.price > 0) {
      updateFields.price = existing.price;
    } else if (data.price && data.price > 0) {
      updateFields.price = data.price;
    } else {
      updateFields.price = existing.price || null;
    }

    if (updateFields.status === OrderStatus.IN_DELIVERY && existing.status !== OrderStatus.IN_DELIVERY) {
      if (!existing.pickedUpAt) updateFields.pickedUpAt = new Date();
    }
    if (
      (updateFields.status === OrderStatus.NEW || updateFields.status === OrderStatus.ASSIGNED) &&
      existing.status !== updateFields.status
    ) {
      updateFields.pickedUpAt = null;
    }

    const isCancelledOrReturned =
      updateFields.status === OrderStatus.CANCELLED || updateFields.status === OrderStatus.RETURNED;
    const isPickup = updateFields.address?.toLowerCase().includes("самовывоз");

    if (isCancelledOrReturned || isPickup) {
      if (existing.routeId && updateFields.routeId !== null) {
        const siblingsCount = await prisma.order.count({
          where: { routeId: existing.routeId, id: { not: existing.id } },
        });
        if (siblingsCount === 0) await prisma.route.deleteMany({ where: { id: existing.routeId } });
        updateFields.routeId    = null;
        updateFields.routeOrder = null;
      }
    }

    // 🔥 ИСПРАВЛЕНО: строим changes ДО upsert, на основе existing vs data
    // (не из результата upsert — там уже перезаписано)
    const hasCoreChanges =
      (existing.crmStatus       ?? "") !== (data.crmStatus       ?? "") ||
      (existing.courierId       ?? 0)  !== (data.courierId       ?? 0)  ||
      (existing.courier         ?? "") !== (data.courier         ?? "") ||
      (existing.items           ?? "") !== (data.items           ?? "") ||
      (existing.slotFrom        ?? "") !== (data.slotFrom        ?? "") ||
      (existing.slotTo          ?? "") !== (data.slotTo          ?? "") ||
      (existing.price           ?? 0)  !== (updateFields.price   ?? 0)  ||
      (existing.recipientPhone  ?? "") !== (data.recipientPhone  ?? "") || // 🔥 ВОЗВРАЩЕНО
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
    // 🔥 ИСПРАВЛЕНО: changes строим из existing vs order (после upsert — финальные значения)
    const changes = {
      statusChanged:         (existing.crmStatus      ?? "") !== (order.crmStatus      ?? ""),
      courierChanged:        (existing.courierId       ?? 0)  !== (order.courierId       ?? 0),
      slotChanged:           (existing.slotRaw         ?? "") !== (order.slotRaw         ?? ""),
      addressChanged:        (existing.address         ?? "") !== (order.address         ?? ""),
      commentChanged:        (existing.comment         ?? "") !== (order.comment         ?? ""),
      opCommentChanged:      (existing.opComment       ?? "") !== (order.opComment       ?? ""),
      itemsChanged:          (existing.items           ?? "") !== (order.items           ?? ""),
      recipientPhoneChanged: (existing.recipientPhone  ?? "") !== (order.recipientPhone  ?? ""), // 🔥 ВОЗВРАЩЕНО
    };

    if (Object.values(changes).some(Boolean)) {
      notify({
        type: "order.updated",
        order,
        previousStatus: changes.statusChanged ? existing.status : undefined,
        changes,
      }).catch(console.error);
    }
  }

  return order;
}
// ─────────────────────────────────────────────────────────────────────────────
// POLLING BUNCH
// ─────────────────────────────────────────────────────────────────────────────

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
      where: { 
        status: { notIn: ["DELIVERED", "CANCELLED", "RETURNED"] },
        shop: { notIn: MEURA_SHOPS } 
      },
      select: { crmId: true },
    });
    const activeIds = activeOrders.map(o => o.crmId);

    for (let i = 0; i < activeIds.length; i += 50) {
      const chunk = activeIds.slice(i, i + 50);
      const params = new URLSearchParams();
      params.append("apiKey", CRM_KEY);
      params.append("limit", "100");
      chunk.forEach(id => params.append("filter[ids][]", id));
      const resUpdate = await axios.get<CrmOrdersResponse>(`${CRM_URL}/api/v5/orders?${params.toString()}`, { timeout: 15_000 });
      
      const returnedOrders = resUpdate.data?.orders || [];
      
      for (const order of returnedOrders) {
        await upsertOrder(order);
      }

      const returnedIds = returnedOrders.map(o => String(o.id));
      const deletedIds = chunk.filter(id => !returnedIds.includes(id));

      if (deletedIds.length > 0) {
        console.log(`[Cron] Внимание! Эти заказы пропали из CRM:`, deletedIds);
        
        const localOrdersToCancel = await prisma.order.findMany({ 
          where: { 
            crmId: { in: deletedIds },
            shop: { notIn: MEURA_SHOPS } 
          } 
        });

        for (const localOrder of localOrdersToCancel) {
          if (localOrder.routeId) {
            const siblingsCount = await prisma.order.count({ 
              where: { routeId: localOrder.routeId, id: { not: localOrder.id } }
            });
            if (siblingsCount === 0) {
              await prisma.route.deleteMany({ where: { id: localOrder.routeId } });
            }
          }

          await prisma.order.update({
            where: { id: localOrder.id },
            data: {
              status: "CANCELLED",
              opComment: "❌ Удален в CRM (или перенесен в корзину)",
              routeId: null,
              routeOrder: null,
              pickedUpAt: null
            }
          });
          
          console.log(`[Cron Bunch] Локальный заказ ${localOrder.crmId} переведен в статус CANCELLED.`);
        }

        const tgToken = process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

        if (tgToken && tgChatId && localOrdersToCancel.length > 0) {
          const cancelledIdsStr = localOrdersToCancel.map(o => o.crmId).join(", ");
          const msg = `⚠️ *Внимание! Удаление в CRM Bunch*\n\nСледующие заказы пропали из RetailCRM (удалили или перенесли в корзину) и были автоматически отменены в базе курьеров:\n📦 ${cancelledIdsStr}`;

          fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: tgChatId, text: msg, parse_mode: "Markdown" }),
          }).catch(e => console.error("[TG] Ошибка отправки уведомления об удалении:", e));
        }
      }
    }

    await prisma.syncState.upsert({ where: { id: 1 }, update: { lastSyncAt: new Date() }, create: { id: 1, lastSyncAt: new Date() } });
    geocodeNewOrders().catch(console.error);
  } catch (err) {
    console.error("[Cron] Error polling CRM:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ОБНОВЛЕНИЕ ЗАКАЗА В CRM (статус, курьер, адрес — без цены)
// ─────────────────────────────────────────────────────────────────────────────

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
  if (!CRM_URL) return;

  const orderInDb = await prisma.order.findUnique({ where: { crmId }, select: { shop: true } });
  const isMeura = orderInDb?.shop === 'kaktusfiori' || orderInDb?.shop === 'meura-flowers';
  const apiKeyToUse = isMeura ? CRM_KEY_MEURA : CRM_KEY;

  if (!apiKeyToUse) return;

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
      resetParams.append("apiKey", apiKeyToUse);
      resetParams.append("order", JSON.stringify({ delivery: { code: "self-delivery" } }));
      resetParams.append("by", "id");
      await axios.post(`${CRM_URL}/api/v5/orders/${crmId}/edit`, resetParams.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000,
      }).catch(() => {});
      orderPayload.delivery = { code: "logisty", typeId: 5 };
      orderPayload.customFields = { courier: null, kurier: null };
    }
  }

  if (Object.keys(orderPayload).length === 0) return;

  const params = new URLSearchParams();
  params.append("apiKey", apiKeyToUse);

  // 🔥 ДОБАВЛЯЕМ ПАРАМЕТР МАГАЗИНА, ЧТОБЫ CRM НЕ РУГАЛАСЬ
  if (orderInDb?.shop) {
    params.append("site", orderInDb.shop); 
  }
  params.append("order", JSON.stringify(orderPayload));
  params.append("by", "id");

  try {
    await axios.post(`${CRM_URL}/api/v5/orders/${crmId}/edit`, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000,
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error(`[CRM] Ошибка обновления заказа ${crmId}:`, err?.response?.data ?? err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// СЕБЕСТОИМОСТЬ В CRM
export async function updateCrmOrderDeliveryPrice(crmId: string, basePrice: number) {
  if (!CRM_URL) return;

  const orderInDb = await prisma.order.findUnique({ where: { crmId }, select: { shop: true } });
  const isMeura = orderInDb?.shop === 'kaktusfiori' || orderInDb?.shop === 'meura-flowers';
  const apiKeyToUse = isMeura ? CRM_KEY_MEURA : CRM_KEY;

  if (!apiKeyToUse) return;

  const NET_COST_MAP: Record<number, number> = {
    500: 732, 600: 838, 900: 1157, 1000: 1264, 1300: 1583, 1400: 1689,
  };
  const calculatedNetCost = NET_COST_MAP[basePrice] || basePrice;

  const params = new URLSearchParams();
  params.append("apiKey", apiKeyToUse);
  
  // 🔥 ДОБАВЛЯЕМ ПАРАМЕТР МАГАЗИНА ЗДЕСЬ ТОЖЕ
  if (orderInDb?.shop) {
    params.append("site", orderInDb.shop); 
  }

  params.append("order", JSON.stringify({ delivery: { netCost: calculatedNetCost } }));
  params.append("by", "id");

  try {
    await axios.post(`${CRM_URL}/api/v5/orders/${crmId}/edit`, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000,
    });
  } catch (err: any) {
    console.error(`[CRM] Ошибка обновления себестоимости:`, err?.response?.data ?? err.message);
  }
}
// ─────────────────────────────────────────────────────────────────────────────
// POLLING ДЛЯ MEURA
// ─────────────────────────────────────────────────────────────────────────────
export async function pollMeuraOrders() {
  if (!CRM_URL || !CRM_KEY_MEURA) return;

  try {
    const dateFrom = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString().split("T")[0];
    
    const params = new URLSearchParams();
    params.append("apiKey", CRM_KEY_MEURA);
    params.append("filter[createdAtFrom]", dateFrom);
    params.append("filter[sites][]", "kaktusfiori");
    params.append("filter[sites][]", "meura-flowers");
    params.append("limit", "50");

    const res = await axios.get<CrmOrdersResponse>(`${CRM_URL}/api/v5/orders?${params.toString()}`, { timeout: 15_000 });
    
    const orders = res.data?.orders || [];
    for (const order of orders) {
      await upsertOrder(order);
    }
    
    console.log(`[Cron Meura] Синхронизировано ${orders.length} заказов.`);
  } catch (err) {
    console.error("[Cron Meura] Ошибка синхронизации:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ТИПЫ
// ─────────────────────────────────────────────────────────────────────────────

export interface CrmOrder {
  id: number; number?: string; externalId?: string; status?: string;
  site?: string; // 🔥 Добавлено
  createdAt?: string; customerComment?: string; managerComment?: string;
  firstName?: string; lastName?: string; phone?: string; email?: string;
  customer?: {
    firstName?: string; lastName?: string;
    phones?: Array<{ number?: string }>;
    email?: string;
  };
  delivery?: {
    time?: unknown; date?: string; cost?: number; code?: string;
    address?: { text?: string };
    service?: { name?: string; code?: string };
    data?: unknown; courier?: unknown;
  };
  items?: Array<{
    productName?: string; quantity?: number; initialPrice?: number;
    offer?: { name?: string; displayName?: string };
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customFields?: any;
}

export interface CrmOrdersResponse {
  orders: CrmOrder[];
  pagination: { currentPage: number; totalPageCount: number };
}