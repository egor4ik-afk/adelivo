// src/app/api/manager/orders/[id]/route.ts
// Чтение и редактирование карточки заказа из кабинета менеджера.
// Отдельно от /api/orders/[id], потому что тот эндпоинт занят синхронизацией
// статусов с CRM и содержит защиты, не нужные при ручном редактировании полей.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { geocodeAddress, calcBaseDeliveryPrice, updateCrmOrder } from "@/lib/crm";
import { OrderStatus } from "@prisma/client";

function normPhone(raw?: string | null) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  const x = d.startsWith("8") ? "7" + d.slice(1) : d;
  return "+" + x;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(order);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "COURIER") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const b = await req.json();

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};

    // Адрес изменили — перегеокодируем и пересчитаем себестоимость
    if (b.address !== undefined && b.address !== order.address) {
      data.address = String(b.address).trim();
      // Город магазина заказа, а не Москва по умолчанию
      const shopCity = order.shop
        ? (await prisma.shop.findUnique({ where: { slug: order.shop }, select: { city: true } }))?.city ?? null
        : null;
      const geo = await geocodeAddress(data.address, shopCity);
      data.lat = geo?.lat ?? null;
      data.lng = geo?.lng ?? null;
      data.geocoded = !!geo;
      data.isInvalid = !geo;
      data.invalidReason = geo ? null : "Адрес не определился после ручного изменения";
      if (geo?.lat && geo?.lng) data.costPrice = calcBaseDeliveryPrice(geo.lat, geo.lng, shopCity);
    }

    if (b.name !== undefined) data.name = b.name?.trim() || null;
    if (b.recipientPhone !== undefined) data.recipientPhone = normPhone(b.recipientPhone);
    if (b.customerName !== undefined) data.customerName = b.customerName?.trim() || null;
    if (b.customerPhone !== undefined) data.customerPhone = normPhone(b.customerPhone);
    if (b.items !== undefined) data.items = b.items?.trim() || null;
    if (b.comment !== undefined) data.comment = b.comment?.trim() || null;
    if (b.opComment !== undefined) data.opComment = b.opComment?.trim() || null;
    if (b.price !== undefined) data.price = b.price === "" || b.price === null ? null : Number(b.price);
    if (b.shop !== undefined) data.shop = b.shop?.trim() || null;
    if (b.deliveryType !== undefined) data.deliveryType = b.deliveryType?.trim() || null;
    if (b.deliveryDate !== undefined) data.deliveryDate = b.deliveryDate || null;
    if (b.status !== undefined) data.status = b.status as OrderStatus;

    // Биржа: заказ виден курьерам на карте, пока его не заберут
    // или не снимут вручную. Таймаута нет — так и договаривались.
    if (b.onExchange !== undefined) {
      data.onExchange = !!b.onExchange;
      data.exchangeAt = b.onExchange ? new Date() : null;
      data.exchangeById = b.onExchange ? user.id : null;
      // Выкладывать заказ с уже назначенным курьером бессмысленно:
      // на бирже он никому не нужен, а курьер получит путаницу
      if (b.onExchange) {
        data.courierId = null;
        data.courier = null;
        data.routeId = null;
        data.routeOrder = null;
      }
    }

    if (b.slotFrom !== undefined || b.slotTo !== undefined) {
      const from = b.slotFrom ?? order.slotFrom;
      const to = b.slotTo ?? order.slotTo;
      data.slotFrom = from || null;
      data.slotTo = to || null;
      data.slotRaw = from && to ? `с ${from} до ${to}` : from || null;
    }

    if (b.courierId !== undefined) {
      data.courierId = b.courierId ? Number(b.courierId) : null;
      data.courierManual = !!b.courierId;
    }

    data.changedAt = new Date();

    const updated = await prisma.order.update({ where: { id }, data });

    // Заказ из CRM — пробрасываем изменённый адрес/комментарий обратно.
    // Заказы, заведённые вручную (crmId начинается с MAN-), в CRM не отправляем.
    const isManual = order.crmId.startsWith("MAN-");
    if (!isManual && data.address) {
      try {
        await updateCrmOrder(order.crmId, { address: data.address });
      } catch (e) {
        console.error("[manager/orders PATCH] CRM sync failed", e);
        // Не роняем запрос: в нашей базе изменение уже сохранено
      }
    }

    return NextResponse.json({ ok: true, order: updated });
  } catch (e) {
    console.error("[manager/orders PATCH]", e);
    return NextResponse.json({ error: "Не удалось сохранить заказ" }, { status: 500 });
  }
}


/**
 * DELETE — удаление заказа.
 *
 * Заказы из CRM физически не удаляем: поллинг привезёт их обратно
 * следующим циклом, и удаление будет выглядеть как «не работает».
 * Для них ставим CANCELLED, что и означает «убрать из работы».
 * Удаляются только ручные заказы (crmId с префиксом MAN-).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "COURIER") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isManual = order.crmId.startsWith("MAN-");

    // Маршрут, в котором остался один этот заказ, тоже убираем —
    // иначе у курьера повиснет пустой маршрут
    if (order.routeId) {
      const siblings = await prisma.order.count({
        where: { routeId: order.routeId, id: { not: id } },
      });
      if (siblings === 0) {
        await prisma.route.deleteMany({ where: { id: order.routeId } });
      }
    }

    if (isManual) {
      await prisma.order.delete({ where: { id } });
      return NextResponse.json({ ok: true, deleted: true });
    }

    await prisma.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        courierId: null,
        courier: null,
        routeId: null,
        routeOrder: null,
        onExchange: false,
        changedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      deleted: false,
      note: "Заказ из CRM — переведён в «Отменён». Физическое удаление невозможно: поллинг вернёт его обратно.",
    });
  } catch (e) {
    console.error("[manager/orders DELETE]", e);
    return NextResponse.json({ error: "Не удалось удалить заказ" }, { status: 500 });
  }
}