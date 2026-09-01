// src/app/api/orders/parse/route.ts
// Разбор вставленного текста заявки в поля заказа.
// Ничего не сохраняет — только возвращает распознанное, решение за оператором.
import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/access";
import { parseOrderText } from "@/lib/order-parse";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer.role === "COURIER") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const { text } = await req.json();
    if (!text || String(text).trim().length < 10) {
      return NextResponse.json({ error: "Слишком короткий текст" }, { status: 400 });
    }

    const result = await parseOrderText(String(text));
    return NextResponse.json(result);
  } catch (e) {
    console.error("[orders/parse]", e);
    return NextResponse.json({ error: "Не удалось разобрать текст" }, { status: 500 });
  }
}
