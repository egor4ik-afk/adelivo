// src/app/api/webhooks/retailcrm/route.ts
import { NextResponse } from "next/server";
import { upsertOrder, geocodeNewOrders, type CrmOrder } from "@/lib/crm";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

// Получаем заказ из CRM по внутреннему ID
async function fetchOrderFromCrm(orderId: string): Promise<CrmOrder | null> {
  if (!CRM_URL || !CRM_KEY) return null;
  try {
    const res = await axios.get(`${CRM_URL}/api/v5/orders/${orderId}`, {
      params: { apiKey: CRM_KEY, by: "id" },
      timeout: 8000,
    });
    if (res.data?.success && res.data?.order) return res.data.order;
    return null;
  } catch (e: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (e as any)?.response?.status;
    if (status === 404) {
      console.log(`[Webhook] Заказ ${orderId} не найден в CRM (404)`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.error(`[Webhook] Ошибка получения заказа ${orderId}:`, (e as any)?.message);
    }
    return null;
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "FlowerOps webhook" });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const rawText = await req.text();

    let orderId: string | null = null;

    if (contentType.includes("application/json") || rawText.startsWith("{")) {
      try {
        const body = JSON.parse(rawText);
        orderId = body.orderId ?? body.crm_id ?? body.order?.id ?? null;
      } catch {
        console.error("[Webhook] Ошибка парсинга JSON");
      }
    } else {
      const params = new URLSearchParams(rawText);
      orderId = params.get("order[id]") ?? params.get("orderId") ?? null;
    }

    if (!orderId) {
      console.warn("[Webhook] ID заказа не найден в запросе");
      return NextResponse.json({ ok: false, reason: "missing orderId" });
    }

    console.log(`[Webhook] Получен сигнал для заказа #${orderId}`);

    // Небольшая пауза чтобы CRM успел сохранить изменения до нашего запроса
    await new Promise(r => setTimeout(r, 1000));

    const orderPayload = await fetchOrderFromCrm(orderId);

    if (!orderPayload?.id) {
      console.warn(`[Webhook] Не удалось получить заказ #${orderId}`);
      return NextResponse.json({ ok: false, reason: "order fetch failed" });
    }

    console.log(`[Webhook] Обновляем заказ #${orderPayload.id} (${orderPayload.externalId})`);
    await upsertOrder(orderPayload);
    geocodeNewOrders().catch(console.error);

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("[Webhook] Критическая ошибка:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}