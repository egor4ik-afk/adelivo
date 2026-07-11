// src/app/api/webhooks/retailcrm/route.ts
import { NextResponse } from "next/server";
import { upsertOrder, geocodeNewOrders, type CrmOrder } from "@/lib/crm";
import axios from "axios";
import { applyUniversalEtaShift } from "@/lib/eta";
import { createManagerPlaque } from "@/lib/notifications";


export async function GET() {
  // RetailCRM пингует эндпоинт перед активацией
  return NextResponse.json({ ok: true, service: "EventWave webhook" });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const rawText = await req.text();

    console.log("[Webhook] Получен сигнал от CRM. Content-Type:", contentType);

    let orderId: string | null = null;
    let orderPayload: CrmOrder | null = null;

    if (contentType.includes("application/json") || rawText.startsWith("{")) {
      try {
        const body = JSON.parse(rawText);
        orderId = body.orderId ?? body.crm_id ?? body.order?.id ?? null;
      } catch (e) {
        console.error("[Webhook] Ошибка парсинга JSON:", e);
      }
    } else {
      const params = new URLSearchParams(rawText);
      orderId = 
        params.get("order[id]") ?? 
        params.get("events[0][order][id]") ?? 
        params.get("orderId") ?? 
        null;

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
    
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    orderPayload = await fetchOrderFromCrm(orderId);
    if (!orderPayload?.id) {
      console.warn(`[Webhook] Данные для заказа #${orderId} окончательно не получены (404).`);
      return NextResponse.json({ ok: false, reason: "order fetch failed" });
    }

    // 🔥 ЖЕСТКИЙ ФИЛЬТР МАГАЗИНОВ (ЗАЩИТА ОТ ДРУГИХ ГОРОДОВ)
    const ALLOWED_SHOPS = ['bunch', 'kaktusfiori', 'meura-flowers'];
    
    // Если заказ пришел с любого другого магазина (например, bunch-ekb, bunch-spb)
    if (orderPayload.site && !ALLOWED_SHOPS.includes(orderPayload.site)) {
      console.log(`[Webhook] 🛑 Игнорируем заказ #${orderPayload.id}. Причина: чужой магазин (${orderPayload.site})`);
      // Отвечаем CRM "ok: true", чтобы она успокоилась и не слала его повторно
      return NextResponse.json({ ok: true, ignored: "unsupported_site" });
    }
    if (!orderPayload?.id) {
      console.warn(`[Webhook] Данные для заказа #${orderId} окончательно не получены (404).`);
      return NextResponse.json({ ok: false, reason: "order fetch failed" });
    }

    const shopLabel = orderPayload.site === 'kaktusfiori' || orderPayload.site === 'meura-flowers' ? "MEURA" : "BUNCH";
    console.log(`[Webhook] Начинаем обновление заказа #${orderPayload.id} [${shopLabel}] (Внешний ID: ${orderPayload.externalId || 'Нет'})`);
    
    // Вытаскиваем заказ ДО обновления (берем items и курьера)
    const { prisma } = await import("@/lib/prisma"); 
    const localOrderBefore = await prisma.order.findUnique({
      where: { crmId: String(orderPayload.id) },
      select: { id: true, status: true, items: true }
    });

    await upsertOrder(orderPayload);
    
    try {
      if (localOrderBefore) {
        // Вытаскиваем заказ ПОСЛЕ обновления (добавили выгрузку routeId!)
        const localOrderAfter = await prisma.order.findUnique({
          where: { id: localOrderBefore.id },
          select: { 
            status: true, 
            items: true, 
            courierId: true, 
            courier: true,
            routeId: true // 🔥 Берем ID маршрута
          }
        });

        if (localOrderAfter) {
          // 1. Проверка изменения статуса
          if (localOrderBefore.status !== localOrderAfter.status) {
             if (localOrderAfter.status === "IN_DELIVERY" || localOrderAfter.status === "DELIVERED") {
                 console.log(`[Webhook] Смена статуса! Запускаем пересчет ETA для заказа ${orderPayload.id}`);
                 await applyUniversalEtaShift(localOrderBefore.id, localOrderAfter.status);
             }
          }

          // 2. Проверка изменения СОСТАВА заказа
          if (localOrderBefore.items !== localOrderAfter.items) {
             console.log(`[Webhook] 📦 Изменен состав заказа #${orderPayload.id}!`);
             
             const oldItems = localOrderBefore.items || "Пусто";
             const newItems = localOrderAfter.items || "Пусто";
             const orderNumber = orderPayload.externalId || orderPayload.id;

             // 🔥 Определяем, что писать в "маршрут"
             // Если routeId есть — используем его, если нет — используем номер заказа
             const routeDisplay = localOrderAfter.routeId 
                 ? localOrderAfter.routeId 
                 : `Заказ #${orderNumber}`;

             // Вызываем функцию для табло и пушей
             await createManagerPlaque({
               courierId: localOrderAfter.courierId || "UNASSIGNED",
               courierName: localOrderAfter.courier || "Без курьера",
               routeName: routeDisplay, // 🔥 Передаем реальный маршрут
               oldValue: oldItems,
               newValue: newItems,
               authorName: "CRM",
               changeType: "ITEMS_CHANGED", 
             });
          }
        }
      }
    } catch (err) {
      console.error("[Webhook] Ошибка при обработке триггеров (ETA/Уведомления):", err);
    }
    
    geocodeNewOrders().catch(console.error);
    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("[Webhook] Критическая ошибка:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

async function fetchOrderFromCrm(orderId: string): Promise<CrmOrder | null> {
  const keys = [
    process.env.RETAILCRM_API_KEY,        // Ключ Bunch
    process.env.RETAILCRM_API_KEY_MEURA   // Ключ Meura
  ].filter(Boolean);

  const CRM_URL = process.env.RETAILCRM_API_URL;
  if (!CRM_URL || keys.length === 0) return null;

  const searchTypes = ["externalId", "number", "id"];
  const searchValues = [orderId, `#${orderId}`]; 

  console.log(`🔍 [CRM Fetch] Ищем заказ ${orderId} (проверяем Bunch и Meura)...`);

  for (const key of keys) {
    for (const byType of searchTypes) {
      for (const val of searchValues) {
        if (byType === "id" && val.startsWith("#")) continue;
        try {
          const res = await axios.get(`${CRM_URL}/api/v5/orders/${encodeURIComponent(val)}`, {
            params: { apiKey: key, by: byType },
            timeout: 5000,
          });
          
          if (res.data?.success && res.data?.order) {
            return res.data.order;
          }
        } catch (e: any) {
          // 🔥 Игнорируем 404 (просто не найдено) и 400 (неверный формат для данного поля)
          if (e?.response?.status !== 404 && e?.response?.status !== 400) {
             console.error(`❌ [CRM Fetch] Ошибка API (${byType}=${val}):`, e.message);
          }
        }
      }
    }
  }

  console.log(`❌ [CRM Fetch] Заказ ${orderId} не найден в RetailCRM ни по одному из ключей.`);
  return null;
}
