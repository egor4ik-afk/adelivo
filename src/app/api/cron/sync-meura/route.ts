// src/app/api/cron/sync-meura/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Крон для Meura полностью отключен
  console.log("[Cron Meura] Поллинг отключен.");
  return NextResponse.json({ ok: true, message: "Meura cron is disabled." });
}