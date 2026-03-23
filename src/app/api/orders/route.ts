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
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

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
    // ИСПРАВЛЕНИЕ: Если фронтенд запрашивает все заказы (без конкретной даты),
    // мы отдаем только заказы за последние 10 дней, чтобы не перегружать память
    // и чтобы старые утренние заказы не вытесняли новые вечерние.
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 7);
    
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
    // ИСПРАВЛЕНИЕ: Сортируем строго по дате (самые свежие сверху).
    // Убрали slotFrom из сортировки БД, чтобы вечерние заказы (20:00) не падали в конец списка.
    orderBy: { crmCreatedAt: "desc" },
    take: 3500,
    include: { route: true } // 🔥 ЭТО САМОЕ ГЛАВНОЕ: теперь маршруты подтянутся!
     // Увеличили лимит, чтобы база гарантированно отдавала все текущие заказы
  });

  return NextResponse.json(orders);
}