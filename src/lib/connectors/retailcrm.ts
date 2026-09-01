// src/lib/connectors/retailcrm.ts
// Транспорт RetailCRM, вынесенный из lib/crm.ts под общий интерфейс.
// Логика запросов та же самая — менялась только форма, не поведение.

import axios from "axios";
import type { ConnectorCreds, DeliveryConnector, NormalizedOrder } from "./types";
import type { CrmOrder, CrmOrdersResponse } from "@/lib/crm";

const TIMEOUT = 15_000;

/** Сырой заказ RetailCRM → наш вид. Структура известна заранее, карта полей не нужна. */
export function normalizeRetailCrm(o: CrmOrder): NormalizedOrder {
  const items = (o.items || [])
    .map((i) => {
      const name = i.offer?.displayName || i.offer?.name || i.productName || "";
      const qty = i.quantity ?? 1;
      return name ? `${name} × ${qty}` : "";
    })
    .filter(Boolean)
    .join(", ");

  const phone = o.phone || o.customer?.phones?.[0]?.number || null;

  return {
    externalId: String(o.id),
    address: o.delivery?.address?.text ?? null,
    slotRaw: typeof o.delivery?.time === "string" ? o.delivery.time : null,
    deliveryDate: o.delivery?.date ?? null,
    price: o.delivery?.cost ?? null,
    items: items || null,
    comment: o.customerComment ?? null,
    customerName: [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" ") || null,
    customerPhone: phone,
    recipientName: [o.firstName, o.lastName].filter(Boolean).join(" ") || null,
    recipientPhone: o.phone ?? null,
    externalStatus: o.status ?? null,
    createdAt: o.createdAt ? new Date(o.createdAt) : null,
    raw: o,
  };
}

async function request(creds: ConnectorCreds, params: URLSearchParams): Promise<CrmOrder[]> {
  if (!creds.baseUrl || !creds.apiKey) return [];
  params.append("apiKey", creds.apiKey);
  const url = `${creds.baseUrl.replace(/\/+$/, "")}/api/v5/orders?${params.toString()}`;
  const res = await axios.get<CrmOrdersResponse>(url, { timeout: TIMEOUT });
  return res.data?.orders || [];
}

export const retailCrmConnector: DeliveryConnector = {
  type: "RETAILCRM",

  async fetchOrders(creds, sinceDays) {
    const dateFrom = new Date(Date.now() - sinceDays * 24 * 3_600_000).toISOString().split("T")[0];
    const params = new URLSearchParams();
    params.append("filter[createdAtFrom]", dateFrom);
    for (const site of creds.sites ?? []) params.append("filter[sites][]", site);
    params.append("limit", "100");

    const orders = await request(creds, params);
    return orders.map(normalizeRetailCrm);
  },

  async fetchByIds(creds, ids) {
    if (!ids.length) return [];
    const out: NormalizedOrder[] = [];
    // По 50 идентификаторов за запрос — как в текущем поллинге
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const params = new URLSearchParams();
      params.append("limit", "100");
      chunk.forEach((id) => params.append("filter[ids][]", id));
      const orders = await request(creds, params);
      out.push(...orders.map(normalizeRetailCrm));
    }
    return out;
  },

  async pushStatus(creds, externalId, patch) {
    if (!creds.baseUrl || !creds.apiKey) return;
    const base = creds.baseUrl.replace(/\/+$/, "");

    const order: Record<string, unknown> = {};
    if (patch.status) order.status = patch.status;
    if (patch.deliveryPrice !== undefined) {
      order.delivery = { cost: patch.deliveryPrice };
    }
    if (patch.courierName) {
      // Составные объекты RetailCRM принимает только цельной JSON-строкой,
      // а не разложенными в плоский массив — на этом обычно и спотыкаются.
      order.delivery = {
        ...(order.delivery as object ?? {}),
        courier: { firstName: patch.courierName, phone: patch.courierPhone ?? "" },
      };
    }

    const body = new URLSearchParams();
    body.append("apiKey", creds.apiKey);
    body.append("by", "id");
    body.append("order", JSON.stringify(order));

    await axios.post(`${base}/api/v5/orders/${externalId}/edit`, body.toString(), {
      timeout: TIMEOUT,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },
};
