// src/app/api/webhook/route.ts
import { NextResponse } from "next/server";
import { upsertOrder, geocodeNewOrders, type CrmOrder } from "@/lib/crm";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

// Получаем полный заказ из CRM по его внутреннему ID
async function fetchOrderFromCrm(orderId: string): Promise<CrmOrder | null> {
  if (!CRM_URL || !CRM_KEY) return null;
  try {
    const res = await axios.get(`${CRM_URL}/api/v5/orders/${orderId}`, {
      params: { apiKey: CRM_KEY, by: "id" },
      timeout: 8000,
    });
    return res.data?.order ?? null;
  } catch (e) {
    console.error(`[Webhook] Не удалось получить заказ ${orderId} из CRM:`, e);
    return null;
  }
}

export async function GET() {
  // RetailCRM пингует эндпоинт перед активацией
  return NextResponse.json({ ok: true, service: "FlowerOps webhook" });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const rawText = await req.text();

    console.log("[Webhook] Content-Type:", contentType);
    console.log("[Webhook] Body:", rawText.slice(0, 300));

    let orderId: string | null = null;
    let orderPayload: CrmOrder | null = null;

    if (contentType.includes("application/json")) {
      const body = JSON.parse(rawText);

      // Вариант 1: пришёл только ID — {"orderId":"123"} или {"crm_id":"123"}
      orderId = body.orderId ?? body.crm_id ?? body.order?.id ?? null;

      // Вариант 2: пришёл достаточно полный объект заказа (больше 2 полей)
      if (body.order && typeof body.order === "object" && Object.keys(body.order).length > 2) {
        orderPayload = body.order as CrmOrder;
      }
    } else {
      // form-urlencoded fallback
      const params = new URLSearchParams(rawText);
      orderId = params.get("order[id]") ?? params.get("orderId") ?? null;
      const orderStr = params.get("order");
      if (orderStr) {
        try { orderPayload = JSON.parse(orderStr); } catch { /* not json */ }
      }
    }

    // Если есть только ID — дозапрашиваем полный заказ из CRM
    if (!orderPayload && orderId) {
      console.log(`[Webhook] Запрашиваем заказ #${orderId} из CRM...`);
      orderPayload = await fetchOrderFromCrm(orderId);
    }

    if (!orderPayload?.id) {
      console.warn("[Webhook] Не удалось получить данные заказа");
      return NextResponse.json({ ok: false, reason: "no order data" });
    }

    console.log(`[Webhook] Обрабатываем заказ #${orderPayload.id} (externalId: ${orderPayload.externalId})`);
    await upsertOrder(orderPayload);
    geocodeNewOrders().catch(console.error);

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("[Webhook] Ошибка:", e);
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
