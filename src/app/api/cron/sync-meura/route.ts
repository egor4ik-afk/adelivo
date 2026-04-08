// src/app/api/cron/sync-meura/route.ts
import { NextResponse } from "next/server";
import { pollMeuraOrders } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("[Cron Meura] Запуск синхронизации...");
    await pollMeuraOrders();
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    console.error("[Cron Meura] Ошибка:", err);
    return NextResponse.json({ error: "Meura sync failed" }, { status: 500 });
  }
}