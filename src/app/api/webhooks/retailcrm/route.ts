// src/app/api/webhooks/retailcrm/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  // RetailCRM пингует эндпоинт перед активацией
  return NextResponse.json({ ok: true, service: "EventWave webhook (Disabled)" });
}

export async function POST() {
  // 🔥 ВЕБХУК ПОЛНОСТЬЮ ОТКЛЮЧЕН 🔥
  // Мы перевели всю работу на Cron (раз в 10 минут), чтобы избежать
  // конфликтов между магазинами Bunch и Meura и перезаписи телефонов.
  // Возвращаем 200 OK, чтобы CRM не спамила ошибками.
  
  return NextResponse.json({ ok: true, message: "Webhook is intentionally disabled. Polling is handled by cron." });
}