// src/app/api/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const slot = searchParams.get("slot");       // "20:00-22:00"
  const date = searchParams.get("date");       // "2026-03-17"
  const invalid = searchParams.get("invalid"); // "true"

  const where: Record<string, unknown> = {};

  // Фильтр по слоту
  if (slot && slot !== "all") {
    const [from, to] = slot.split("-");
    if (from) where.slotFrom = from;
    if (to) where.slotTo = to;
  }

  // Фильтр по дате создания в CRM
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    where.crmCreatedAt = { gte: start, lte: end };
  }

  // Только проблемные адреса
  if (invalid === "true") {
    where.isInvalid = true;
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ slotFrom: "asc" }, { crmCreatedAt: "desc" }],
    take: 500,
  });

  return NextResponse.json(orders);
}
