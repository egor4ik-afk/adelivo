// src/app/api/courier/my-orders/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getViewer, shopFilter } from "@/lib/access";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courier = await prisma.courier.findFirst({ where: { email: user.email } });
  if (!courier) return NextResponse.json({ error: "Курьер не привязан" }, { status: 400 });

  // Допуск к работе. Профиль создаётся автоматически при регистрации,
  // поэтому без явного подтверждения курьер не должен получать заказы —
  // иначе любой, кто нашёл ссылку, оказывается в системе на линии.
  if (!courier.isApproved) {
    return NextResponse.json([], {
      headers: { "X-Courier-Status": "pending-approval" },
    });
  }

  if (!courier.isActive) {
    return NextResponse.json([], {
      headers: { "X-Courier-Status": "disabled" },
    });
  }

  // Курьер видит только заказы тех магазинов, что отмечены ему в матрице.
  // Раньше проверялся accessRestricted, а он по умолчанию выключен —
  // из-за этого фильтр фактически не работал.
  const viewer = await getViewer();
  const shopWhere = viewer ? await shopFilter(viewer) : {};

  const orders = await prisma.order.findMany({
    where: {
      courierId: courier.id,
      status: { notIn: ["CANCELLED", "RETURNED"] },
      // 🔥 ДОБАВЛЕН ФИЛЬТР: Показывать только если маршрут НЕ черновик (или если маршрута вообще нет)
      OR: [
        { route: { isDraft: false } },
        { routeId: null }
      ],
      ...shopWhere,
    },
    include: { route: true },
    orderBy: [{ routeId: 'asc' }, { routeOrder: 'asc' }, { slotFrom: 'asc' }]
  });

  return NextResponse.json(orders);
}
