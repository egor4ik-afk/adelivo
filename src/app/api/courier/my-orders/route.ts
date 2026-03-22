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
      status: { notIn: ["CANCELLED", "RETURNED"] }
    },
    include: { route: true }, // 🔥 Добавили подгрузку связанной модели Route
    orderBy: [ { routeId: 'asc' }, { routeOrder: 'asc' }, { slotFrom: 'asc' } ]
  });

  return NextResponse.json(orders);
}