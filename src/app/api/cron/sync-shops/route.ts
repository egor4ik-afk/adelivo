// src/app/api/cron/sync-shops/route.ts
// Опрос магазинов, подключённых через кабинет (Битрикс24, 1С, новые RetailCRM).
//
// Исторические bunch и Meura сюда НЕ попадают — их обслуживают
// /api/cron/sync и /api/cron/sync-meura, как и раньше. Новый путь
// обкатывается на новых магазинах, старый поток не трогается.
import { NextResponse } from "next/server";
import { pollAllShops } from "@/lib/connectors/poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const results = await pollAllShops(2);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error("[cron/sync-shops]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
