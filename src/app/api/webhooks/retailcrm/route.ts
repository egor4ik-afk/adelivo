import { NextRequest, NextResponse } from "next/server";
import { upsertOrder, geocodeNewOrders, type CrmOrder } from "@/lib/crm";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-secret");
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const events = Array.isArray(body) ? body : [body];

    for (const event of events) {
      const { event: type, order } = event;
      if (!order) continue;
      if (["order.created", "order.updated", "order_status.updated"].includes(type)) {
        await upsertOrder(order as CrmOrder);
      }
    }

    geocodeNewOrders().catch(console.error);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Webhook]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}