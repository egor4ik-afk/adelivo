// src/app/api/courier/my-orders/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courier = await prisma.courier.findFirst({ where: { email: user.email } });
  if (!courier) return NextResponse.json({ error: "Курьер не привязан" }, { status: 400 });

  const orders = await prisma.order.findMany({
    where: {
      courierId: courier.id,
      status: { notIn: ["CANCELLED", "RETURNED"] },
      // 🔥 ДОБАВЛЕН ФИЛЬТР: Показывать только если маршрут НЕ черновик (или если маршрута вообще нет)
      OR: [
        { route: { isDraft: false } },
        { routeId: null }
      ]
    },
    include: { route: true }, 
    orderBy: [ { routeId: 'asc' }, { routeOrder: 'asc' }, { slotFrom: 'asc' } ]
  });

  return NextResponse.json(orders);
}