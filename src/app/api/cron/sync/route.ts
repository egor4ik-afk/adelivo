// src/app/api/cron/sync/route.ts
import { NextResponse } from "next/server";
import { pollCrmOrders } from "@/lib/crm";

export async function GET() {
  try {
    await pollCrmOrders();
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    console.error("[Cron sync]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}