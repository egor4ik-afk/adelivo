// src/app/api/courier/exchange/route.ts
// Заказы, выложенные на биржу и доступные этому курьеру.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, shopFilter } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courier = await prisma.courier.findFirst({ where: { email: viewer.email } });
  if (!courier) return NextResponse.json({ orders: [], canTake: false, reason: "Профиль курьера не найден" });

  // Видят биржу все допущенные к работе, а берут — только с привязанной
  // Консолью: без неё выплату отправить некуда.
  const canTake = courier.isApproved && !!courier.konsolContractorId && courier.isSelfEmployed;
  const reason = !courier.isApproved
    ? "Профиль ещё не подтверждён администратором"
    : !courier.konsolContractorId || !courier.isSelfEmployed
    ? "Привяжите Консоль.Про в профиле — без неё выплату отправить некуда"
    : null;

  const orders = await prisma.order.findMany({
    where: {
      onExchange: true,
      takenByCourierId: null,
      courierId: null,
      status: { notIn: ["DELIVERED", "RETURNED", "CANCELLED"] },
      // Заказ виден, только если у курьера есть доступ к его магазину
      ...(await shopFilter(viewer)),
    },
    select: {
      id: true, externalId: true, crmId: true, address: true, lat: true, lng: true,
      items: true, price: true, costPrice: true, comment: true,
      slotFrom: true, slotTo: true, deliveryDate: true, shop: true, exchangeAt: true,
    },
    orderBy: [{ slotTo: "asc" }, { exchangeAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({ orders, canTake, reason });
}