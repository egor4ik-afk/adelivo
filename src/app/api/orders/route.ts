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
  const slot    = searchParams.get("slot");    // "20:00-22:00"
  const date    = searchParams.get("date");    // "2026-03-17"
  const invalid = searchParams.get("invalid"); // "true"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  // Фильтр по слоту
  if (slot && slot !== "all") {
    const [from, to] = slot.split("-");
    if (from) where.slotFrom = from;
    if (to)   where.slotTo   = to;
  }

  // Фильтр по дате
  if (date) {
    // 🔥 ИСПРАВЛЕНИЕ: Жестко фиксируем начало и конец дня в UTC,
    // чтобы сервер не сместил дату из-за своего часового пояса
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);

    where.OR = [
      // Есть явная дата доставки — приоритет
      { deliveryDate: date },
      // Нет даты доставки — смотрим на дату создания
      {
        deliveryDate: null,
        crmCreatedAt: { gte: start, lte: end },
      },
    ];
  } else {
    // Если фронтенд запрашивает все заказы (без конкретной даты),
    // мы отдаем только заказы за последние 10 дней
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 8); // Исправил 8
    
    where.OR = [
      { crmCreatedAt: { gte: tenDaysAgo } },
      { deliveryDate: { gte: tenDaysAgo.toISOString().split("T")[0] } }
    ];
  }

  // Только проблемные адреса
  if (invalid === "true") {
    where.isInvalid = true;
  }

  const orders = await prisma.order.findMany({
    where,
    // Сортируем строго по дате (самые свежие сверху).
    orderBy: { crmCreatedAt: "desc" },
    take: 3500,
    // 🔥 ЭТО САМОЕ ГЛАВНОЕ: теперь маршруты подтянутся вместе с isDraft!
    include: { route: true } 
  });

  return NextResponse.json(orders);
}