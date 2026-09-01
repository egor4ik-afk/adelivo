// src/app/api/courier/my-orders/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

  // Ограничение по магазинам, если оно включено для этого пользователя.
  // Пока accessRestricted = false — фильтра нет, поведение прежнее.
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { accessRestricted: true, isSuperAdmin: true },
  });

  let shopFilter = {};
  if (account?.accessRestricted && !account.isSuperAdmin) {
    const allowed = await prisma.shopAccess.findMany({
      where: { userId: user.id },
      select: { shopId: true },
    });
    shopFilter = { shopId: { in: allowed.map((a) => a.shopId) } };
  }

  const orders = await prisma.order.findMany({
    where: {
      courierId: courier.id,
      status: { notIn: ["CANCELLED", "RETURNED"] },
      // 🔥 ДОБАВЛЕН ФИЛЬТР: Показывать только если маршрут НЕ черновик (или если маршрута вообще нет)
      OR: [
        { route: { isDraft: false } },
        { routeId: null }
      ],
      ...shopFilter,
    },
    include: { route: true },
    orderBy: [{ routeId: 'asc' }, { routeOrder: 'asc' }, { slotFrom: 'asc' }]
  });

  return NextResponse.json(orders);
}
