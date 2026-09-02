// src/app/api/courier/exchange/[id]/take/route.ts
// Захват заказа с биржи.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, visibleShopIds } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courier = await prisma.courier.findFirst({ where: { email: viewer.email } });
  if (!courier) return NextResponse.json({ error: "Профиль курьера не найден" }, { status: 400 });

  if (!courier.isApproved) {
    return NextResponse.json({ error: "Профиль ещё не подтверждён администратором" }, { status: 403 });
  }
  // Тот же критерий, что и в списке и в профиле: наличие konsolContractorId
  if (!courier.konsolContractorId) {
    return NextResponse.json(
      { error: "Привяжите Консоль.Про — без неё выплату отправить некуда" },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;

  // Доступ к магазину заказа
  const shopIds = await visibleShopIds(viewer);
  const order = await prisma.order.findUnique({
    where: { id },
    select: { shopId: true, onExchange: true },
  });
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  if (shopIds !== null && (!order.shopId || !shopIds.includes(order.shopId))) {
    return NextResponse.json({ error: "Заказ недоступен" }, { status: 403 });
  }

  // Захват одним запросом с условием в WHERE.
  // Через findUnique + update два курьера, нажавшие одновременно,
  // получили бы заказ оба: между чтением и записью есть окно.
  // updateMany выполняет проверку и запись атомарно — второй получит count = 0.
  const res = await prisma.order.updateMany({
    where: { id, onExchange: true, takenByCourierId: null, courierId: null },
    data: {
      takenByCourierId: courier.id,
      takenAt: new Date(),
      courierId: courier.id,
      courier: courier.fullName,
      onExchange: false,
      status: "ASSIGNED",
      courierManual: true,
      changedAt: new Date(),
    },
  });

  if (res.count === 0) {
    return NextResponse.json({ error: "Заказ уже забрали" }, { status: 409 });
  }

  const taken = await prisma.order.findUnique({
    where: { id },
    select: { id: true, externalId: true, address: true },
  });

  return NextResponse.json({ ok: true, order: taken });
}