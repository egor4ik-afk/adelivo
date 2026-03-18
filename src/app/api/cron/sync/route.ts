import { NextRequest, NextResponse } from "next/server";
import { pollCrmOrders } from "@/lib/crm";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await pollCrmOrders();
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    console.error("[Cron sync]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}