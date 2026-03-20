// src/app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { upsertOrder, geocodeNewOrders, type CrmOrder } from "@/lib/crm";

// RetailCRM шлёт вебхук в нескольких форматах в зависимости от версии и настроек:
// 1. JSON: { "event": "order_created", "order": { ... } }
// 2. Form-encoded: event=order_created&order=%7B...%7D  (URL-encoded JSON)
// 3. Обёрнутый массив: [{ "event": "...", "order": { ... } }]
// Этот хендлер обрабатывает все три варианта.

const ALLOWED_EVENTS = new Set([
  "order_created",
  "order_updated",
  "order.created",
  "order.updated",
  "order_status.updated",
]);

export async function POST(req: NextRequest) {
  // Проверка секрета (включите когда убедитесь что вебхук работает)
  const secret = req.headers.get("x-secret");
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    console.warn("[Webhook] Unauthorized — неверный x-secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let events: Array<{ event?: string; order?: unknown }> = [];

    if (contentType.includes("application/x-www-form-urlencoded")) {
      // Form-encoded: RetailCRM иногда шлёт так через триггеры
      const text = await req.text();
      const params = new URLSearchParams(text);

      const eventType = params.get("event") ?? params.get("type") ?? "order_updated";
      const orderRaw = params.get("order") ?? params.get("data");

      if (orderRaw) {
        try {
          events = [{ event: eventType, order: JSON.parse(orderRaw) }];
        } catch {
          // Иногда приходит без обёртки — пробуем распарсить весь body как заказ
          try {
            const obj = JSON.parse(decodeURIComponent(text));
            events = [{ event: eventType, order: obj }];
          } catch {
            console.error("[Webhook] Не удалось распарсить form body:", text.slice(0, 200));
          }
        }
      }
    } else {
      // JSON (основной путь)
      const body = await req.json();

      if (Array.isArray(body)) {
        events = body;
      } else if (body?.order) {
        // { event: "...", order: { ... } }
        events = [body];
      } else if (body?.id && body?.status !== undefined) {
        // Прямой объект заказа без обёртки (редко, но бывает)
        events = [{ event: "order_updated", order: body }];
      } else {
        // RetailCRM иногда кладёт заказ в body.orders (массив)
        const orders = body?.orders ?? body?.data?.orders ?? [];
        events = orders.map((o: unknown) => ({ event: "order_updated", order: o }));
      }
    }

    let processed = 0;
    for (const ev of events) {
      const eventType = ev.event ?? "order_updated";
      const order = ev.order;

      if (!order) {
        console.warn("[Webhook] Событие без заказа:", eventType);
        continue;
      }

      if (!ALLOWED_EVENTS.has(eventType)) {
        console.log(`[Webhook] Пропущено событие: ${eventType}`);
        continue;
      }

      console.log(`[Webhook] Обрабатываем ${eventType} — заказ #${(order as CrmOrder).id ?? "?"}`);
      await upsertOrder(order as CrmOrder);
      processed++;
    }

    // Геокодирование запускаем в фоне — не блокируем ответ CRM
    if (processed > 0) {
      geocodeNewOrders().catch(console.error);
    }

    console.log(`[Webhook] Обработано ${processed} из ${events.length} событий`);
    return NextResponse.json({ ok: true, processed });

  } catch (err) {
    console.error("[Webhook] Ошибка:", err);
    // Возвращаем 200 чтобы CRM не помечала вебхук как сломанный
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 200 });
  }
}

// RetailCRM иногда шлёт GET для проверки доступности эндпоинта
export async function GET() {
  return NextResponse.json({ ok: true, service: "FlowerOps webhook" });
}
