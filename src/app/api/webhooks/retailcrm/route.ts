// src/app/api/webhook/route.ts
import { NextResponse } from "next/server";
import { upsertOrder, geocodeNewOrders, type CrmOrder } from "@/lib/crm";

// RetailCRM шлёт вебхуки в form-urlencoded формате:
// topic=orders&event=order_created&order[id]=123&order[status]=new&...
// ИЛИ (если настроить тело вручную) как JSON: {"event":"...","order":{...}}

export async function GET() {
  // RetailCRM пингует эндпоинт перед активацией — должны ответить 200
  return NextResponse.json({ ok: true, service: "FlowerOps webhook" });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    const rawText = await req.text();

    console.log("[Webhook] Content-Type:", contentType);
    console.log("[Webhook] Raw body (first 500):", rawText.slice(0, 500));

    let orderPayload: CrmOrder | null = null;

    if (contentType.includes("application/json")) {
      // Наша ручная настройка: {"event":"order_created","order":{...}}
      const body = JSON.parse(rawText);
      orderPayload = typeof body.order === "string"
        ? JSON.parse(body.order)
        : body.order ?? null;

    } else {
      // RetailCRM стандартный формат: form-urlencoded
      // topic=orders&event=order_created&order[id]=...&order[externalId]=...
      const params = new URLSearchParams(rawText);

      // Вариант 1: order передан как JSON-строка в поле "order"
      const orderStr = params.get("order");
      if (orderStr) {
        try {
          orderPayload = JSON.parse(orderStr);
        } catch {
          // не JSON — идём дальше
        }
      }

      // Вариант 2: поля заказа переданы как order[field]=value (стандарт RetailCRM)
      if (!orderPayload) {
        const orderId = params.get("order[id]") ?? params.get("order%5Bid%5D");
        if (orderId) {
          // Собираем объект из отдельных полей
          const obj: Record<string, unknown> = {};
          for (const [key, val] of params.entries()) {
            const m = key.match(/^order\[(.+)\]$/);
            if (m) obj[m[1]] = val;
          }
          if (obj.id) {
            orderPayload = { id: Number(obj.id), ...obj } as unknown as CrmOrder;
          }
        }
      }

      // Вариант 3: весь body — JSON (некоторые версии RetailCRM)
      if (!orderPayload) {
        try {
          const body = JSON.parse(rawText);
          orderPayload = body.order ?? (body.id ? body : null);
        } catch {
          // не JSON
        }
      }
    }

    if (!orderPayload?.id) {
      console.warn("[Webhook] Не удалось извлечь заказ из тела запроса");
      // Возвращаем 200 чтобы CRM не деактивировала вебхук
      return NextResponse.json({ ok: false, reason: "no order payload" });
    }

    console.log(`[Webhook] Обрабатываем заказ #${orderPayload.id}`);
    await upsertOrder(orderPayload);
    geocodeNewOrders().catch(console.error);

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("[Webhook] Ошибка:", e);
    // 200 чтобы CRM не деактивировала триггер после нескольких ошибок
    return NextResponse.json({ ok: false, error: String(e) });
  }
}