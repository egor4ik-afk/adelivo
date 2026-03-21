// src/app/api/webhooks/retailcrm/route.ts
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
      timeout: 10000,
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
      
      // 🔥 ФИКС: Учитываем все возможные форматы, которые шлет RetailCRM
      orderId = 
        params.get("order[id]") ?? 
        params.get("events[0][order][id]") ?? // <-- Формат для точечного изменения 1 поля
        params.get("orderId") ?? 
        null;

      // Резервный поиск через регулярку (если CRM прислала сложный многомерный массив истории)
      if (!orderId) {
        const match = rawText.match(/events%5B\d+%5D%5Border%5D%5Bid%5D=(\d+)/);
        if (match) orderId = match[1];
      }
    }

    if (!orderId) {
      console.warn("[Webhook] Не найден ID заказа в запросе. Тело:", rawText.substring(0, 200));
      return NextResponse.json({ ok: false, reason: "missing orderId" });
    }

    // 2. Всегда запрашиваем свежий заказ из CRM по ID
    console.log(`[Webhook] Запрашиваем актуальные данные заказа #${orderId} из CRM...`);
    
    // 🔥 ПАУЗА 3 СЕКУНДЫ: Ждем, пока RetailCRM обновит кэш поиска по API
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    orderPayload = await fetchOrderFromCrm(orderId);

    if (!orderPayload?.id) {
      console.warn(`[Webhook] Данные для заказа #${orderId} не получены из CRM.`);
      return NextResponse.json({ ok: false, reason: "order fetch failed" });
    }

    console.log(`[Webhook] Начинаем обновление заказа #${orderPayload.id} (Внешний ID: ${orderPayload.externalId || 'Нет'})`);
    
    // 3. Сохраняем в БД (upsertOrder обновит адрес и скинет гео-координаты)
    await upsertOrder(orderPayload);
    
    // 4. Запускаем фоновое геокодирование, если это новый адрес
    geocodeNewOrders().catch(console.error);

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("[Webhook] Критическая ошибка:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}