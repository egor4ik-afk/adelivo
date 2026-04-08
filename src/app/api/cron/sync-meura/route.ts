import { NextResponse } from "next/server";
import { pollMeuraOrders } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  console.log("[Cron] Запуск поллинга Meura...");
  
  try {
    await pollMeuraOrders();
    return NextResponse.json({ success: true, message: "Meura orders synced" });
  } catch (error) {
    console.error("[Cron] Ошибка Meura:", error);
    return NextResponse.json({ success: false, error: "Sync failed" }, { status: 500 });
  }
}