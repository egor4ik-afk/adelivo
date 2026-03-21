// src/app/api/webhooks/retailcrm/route.ts
import { NextResponse } from "next/server";
import { upsertOrder, geocodeNewOrders, type CrmOrder } from "@/lib/crm";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

// Умный поиск заказа с ретраями (защита от гонки и разных типов ID)
async function fetchOrderFromCrm(orderId: string, retryCount = 0): Promise<CrmOrder | null> {
  if (!CRM_URL || !CRM_KEY) return null;

  // Пробуем искать по всем возможным типам идентификаторов
  const searchTypes = ["id", "externalId", "number"];

  for (const byType of searchTypes) {
    try {
      const res = await axios.get(`${CRM_URL}/api/v5/orders/${orderId}`, {
        params: { apiKey: CRM_KEY, by: byType },
        timeout: 8000,
      });
      if (res.data?.success && res.data?.order) {
        return res.data.order;
      }
    } catch (e: unknown) {
      // Игнорируем 404, чтобы цикл перешел к следующему типу поиска
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any).response?.status !== 404) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        console.error(`[Webhook] Ошибка CRM API (${byType}):`, (e as any).message);
      }
    }
  }

  // Если ни по одному ключу не найдено, возможно это задержка базы данных самой CRM
  if (retryCount < 2) {
    console.log(`[Webhook] Заказ ${orderId} пока не доступен в API. Ждем 3 сек (попытка ${retryCount + 1})...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return fetchOrderFromCrm(orderId, retryCount + 1);
  }

  return null;
}

export async function GET() {
  // RetailCRM пингует эндпоинт перед активацией
  return NextResponse.json({ ok: true, service: "FlowerOps webhook" });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const rawText = await req.text();

    console.log("[Webhook] Получен сигнал от CRM. Content-Type:", contentType);

    let orderId: string | null = null;
    let orderPayload: CrmOrder | null = null;

    // 1. Пытаемся вытащить ID из тела запроса
    if (contentType.includes("application/json") || rawText.startsWith("{")) {
      try {
        const body = JSON.parse(rawText);
        orderId = body.orderId ?? body.crm_id ?? body.order?.id ?? null;
      } catch (e) {
        console.error("[Webhook] Ошибка парсинга JSON:", e);
      }
    } else {
      // form-urlencoded fallback
      const params = new URLSearchParams(rawText);
      
      // Учитываем все возможные форматы, которые шлет RetailCRM
      orderId = 
        params.get("order[id]") ?? 
        params.get("events[0][order][id]") ?? 
        params.get("orderId") ?? 
        null;

      // Резервный поиск через регулярку (для сложных массивов)
      if (!orderId) {
        const match = rawText.match(/events%5B\d+%5D%5Border%5D%5Bid%5D=(\d+)/);
        if (match) orderId = match[1];
      }
    }

    if (!orderId) {
      console.warn("[Webhook] Не найден ID заказа в запросе.");
      return NextResponse.json({ ok: false, reason: "missing orderId" });
    }

    console.log(`[Webhook] Запрашиваем актуальные данные заказа #${orderId} из CRM...`);
    
    // 🔥 ПАУЗА 3 СЕКУНДЫ: Ждем, пока RetailCRM обновит кэш поиска по API
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    orderPayload = await fetchOrderFromCrm(orderId);

    if (!orderPayload?.id) {
      console.warn(`[Webhook] Данные для заказа #${orderId} окончательно не получены (404).`);
      return NextResponse.json({ ok: false, reason: "order fetch failed" });
    }

    console.log(`[Webhook] Начинаем обновление заказа #${orderPayload.id} (Внешний ID: ${orderPayload.externalId || 'Нет'})`);
    
    // 3. Сохраняем в БД
    await upsertOrder(orderPayload);
    
    // 4. Запускаем фоновое геокодирование
    geocodeNewOrders().catch(console.error);

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("[Webhook] Критическая ошибка:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}