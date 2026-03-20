import { NextResponse } from "next/server";
import { upsertOrder, CrmOrder } from "@/lib/crm";

export async function POST(req: Request) {
  try {
    const rawText = await req.text();
    let orderPayload: CrmOrder | null = null;

    try {
      // Пытаемся прочитать как JSON (Твоя настройка {"event": "...", "order": ...})
      const body = JSON.parse(rawText);
      // Иногда RetailCRM кладет объект заказа прямо внутрь, иногда как строку
      orderPayload = typeof body.order === "string" ? JSON.parse(body.order) : body.order;
    } catch (e) {
      // Фолбэк: если пришло стандартным форматом x-www-form-urlencoded
      const params = new URLSearchParams(rawText);
      const oStr = params.get("order");
      if (oStr) orderPayload = JSON.parse(oStr);
    }

    if (orderPayload && orderPayload.id) {
      await upsertOrder(orderPayload);
      console.log(`[Webhook] Успешно обработан заказ ${orderPayload.id}`);
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[Webhook Error]", e);
    return NextResponse.json({ error: "Webhook process failed" }, { status: 500 });
  }
}