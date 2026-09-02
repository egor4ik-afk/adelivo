// src/app/api/manager/orders/route.ts
// Создание заказа вручную (без CRM). Используется страницей /manager/orders/new.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getViewer, visibleShopIds } from "@/lib/access";
import { geocodeAddress, calcBaseDeliveryPrice } from "@/lib/crm";
import { OrderStatus } from "@prisma/client";

// Заказы, заведённые руками, помечаются этим префиксом в crmId —
// так их легко отличить от приехавших из CRM и не сломать синхронизацию.
const MANUAL_PREFIX = "MAN-";

function normPhone(raw?: string | null) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  const x = d.startsWith("8") ? "7" + d.slice(1) : d;
  return "+" + x;
}

export async function POST(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "COURIER") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const b = await req.json();

    if (!b.address || !String(b.address).trim()) {
      return NextResponse.json({ error: "Укажите адрес доставки" }, { status: 400 });
    }

    // Магазин обязателен. Доступ к заказам считается по shopId, поэтому
    // заказ без магазина не увидит вообще никто, включая того, кто его создал.
    if (!b.shopId) {
      return NextResponse.json({ error: "Выберите магазин" }, { status: 400 });
    }

    const viewer = await getViewer(req);
    const allowed = viewer ? await visibleShopIds(viewer) : [];
    if (allowed !== null && !allowed.includes(b.shopId)) {
      return NextResponse.json({ error: "Магазин недоступен" }, { status: 403 });
    }

    const shop = await prisma.shop.findUnique({
      where: { id: b.shopId },
      select: { id: true, slug: true },
    });
    if (!shop) return NextResponse.json({ error: "Магазин не найден" }, { status: 404 });

    // Номер заказа: свой, если задали, иначе генерим
    const externalId = b.externalId?.trim() || String(Date.now()).slice(-6);
    const crmId = `${MANUAL_PREFIX}${shop.slug}-${externalId}`;

    const exists = await prisma.order.findUnique({ where: { crmId } });
    if (exists) {
      return NextResponse.json(
        { error: `Заказ с номером ${externalId} уже существует` },
        { status: 409 }
      );
    }

    // Геокодинг сразу при создании — чтобы заказ не висел «непроверенным»
    const geo = await geocodeAddress(String(b.address));
    const costPrice =
      geo?.lat && geo?.lng ? calcBaseDeliveryPrice(geo.lat, geo.lng) : null;

    const slotFrom = b.slotFrom || null;
    const slotTo = b.slotTo || null;
    const slotRaw =
      slotFrom && slotTo ? `с ${slotFrom} до ${slotTo}` : slotFrom || null;

    const order = await prisma.order.create({
      data: {
        crmId,
        externalId,
        status: (b.status as OrderStatus) || OrderStatus.NEW,
        address: String(b.address).trim(),
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        geocoded: !!geo,
        isInvalid: !geo,
        invalidReason: geo ? null : "Адрес не определился при создании",
        costPrice,
        price: b.price ? Number(b.price) : null,
        name: b.name?.trim() || null,
        recipientPhone: normPhone(b.recipientPhone),
        customerName: b.customerName?.trim() || null,
        customerPhone: normPhone(b.customerPhone),
        items: b.items?.trim() || null,
        comment: b.comment?.trim() || null,
        opComment: b.opComment?.trim() || null,
        shopId: shop.id,
        shop: shop.slug,
        deliveryType: b.deliveryType?.trim() || null,
        deliveryDate: b.deliveryDate || null,
        slotFrom,
        slotTo,
        slotRaw,
        courierId: b.courierId ? Number(b.courierId) : null,
        courierManual: !!b.courierId,
        crmCreatedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, order });
  } catch (e) {
    console.error("[manager/orders POST]", e);
    return NextResponse.json({ error: "Не удалось создать заказ" }, { status: 500 });
  }
}
