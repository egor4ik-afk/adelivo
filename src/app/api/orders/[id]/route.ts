// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder } from "@/lib/crm";
import { notify } from "@/lib/notifications";
import { OrderStatus } from "@prisma/client";

const STORE_COORDS = "55.749511,37.596205";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (body.status         !== undefined) updateData.status         = body.status;
    if (body.opComment      !== undefined) updateData.opComment      = body.opComment;
    if (body.address        !== undefined) updateData.address        = body.address;
    if (body.recipientPhone !== undefined) updateData.recipientPhone = body.recipientPhone;
    
    // 🔥 ДОБАВЛЕНО: обновляем время, комментарии и состав
    if (body.slotRaw        !== undefined) updateData.slotRaw        = body.slotRaw;
    if (body.comment        !== undefined) updateData.comment        = body.comment;
    if (body.items          !== undefined) updateData.items          = body.items;

    if (body.routeId    !== undefined) updateData.routeId    = body.routeId;
    if (body.routeOrder !== undefined) updateData.routeOrder = body.routeOrder;

    if (body.courier !== undefined) {
      if (body.courier) {
        const numericId = Number(body.courier);
        const dbCourier = await prisma.courier.findFirst({
          where: isNaN(numericId)
            ? { fullName: body.courier }
            : { id: numericId },
        });
        updateData.courier   = dbCourier?.fullName ?? body.courier;
        updateData.courierId = dbCourier?.id ?? null;
      } else {
        updateData.courier     = null;
        updateData.courierId   = null;
        updateData.courierLink = null;
      }
    }

    // ── Свежие координаты из БД ──
    const freshCoords = await prisma.order.findUnique({
      where: { id },
      select: { lat: true, lng: true },
    });
    const freshLat = freshCoords?.lat;
    const freshLng = freshCoords?.lng;

    // ── Генерация ссылки для курьера ──
    const finalCourier = updateData.courier !== undefined ? updateData.courier : order.courier;
    const isCourierChanged = body.courier !== undefined && body.courier !== null;
    const isAddressChanged = body.address !== undefined;

    if (finalCourier && (isCourierChanged || isAddressChanged)) {
      if (freshLat && freshLng) {
        updateData.courierLink = `https://yandex.ru/maps/?mode=routes&rtext=${STORE_COORDS}~${freshLat},${freshLng}&rtt=auto`;
      }
    }

    // ── Автосоздание маршрута ──
    const newCourierId = updateData.courierId as number | undefined;
    const courierIsBeingAssigned = newCourierId && !order.courierId;
    const orderHasNoRoute = !order.routeId && body.routeId === undefined;

    if (courierIsBeingAssigned && orderHasNoRoute) {
      const orderDate = order.deliveryDate
        ? order.deliveryDate.toString().split("T")[0]
        : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

      const routeDay = orderDate.split("-")[2];
      const prefix = `M-${routeDay}`;
      const lastRoute = await prisma.route.findFirst({
        where: { name: { startsWith: prefix } },
        orderBy: { name: "desc" },
      });
      let nextNum = 1;
      if (lastRoute) {
        const match = lastRoute.name.match(new RegExp(`${prefix}(\\d{3,})`));
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      const routeName = `${prefix}${nextNum.toString().padStart(3, "0")}`;

      const routeLink = freshLat && freshLng
        ? `https://yandex.ru/maps/?rtext=${STORE_COORDS}~${freshLat},${freshLng}&rtt=auto`
        : null;

      const newRoute = await prisma.route.create({
        data: {
          name:      routeName,
          link:      routeLink,
          date:      orderDate,
          courierId: newCourierId,
        },
      });

      updateData.routeId    = newRoute.id;
      updateData.routeOrder = 1;

      if (order.status === "NEW") {
        updateData.status = "ASSIGNED";
      }

      const courierRec = await prisma.courier.findUnique({ where: { id: newCourierId } });
      if (courierRec?.email) {
        const courierUser = await prisma.user.findUnique({ where: { email: courierRec.email } });
        if (courierUser) {
          notify({
            type: "route.assigned",
            userId: courierUser.id,
            routeId: routeName,
            pointsCount: 1,
          }).catch(console.error);
        }
      }
    }

    // ── Снятие курьера ──
    const courierIsBeingRemoved = (body.courier === "" || body.courier === null) && order.courierId;
    if (courierIsBeingRemoved && order.routeId) {
      const siblingsCount = await prisma.order.count({
        where: { routeId: order.routeId, id: { not: id } },
      });
      if (siblingsCount === 0) {
        await prisma.route.deleteMany({ where: { id: order.routeId } });
      }
      updateData.routeId    = null;
      updateData.routeOrder = null;
    }

    // ── Автовыброс из маршрута ──
    const newStatus  = body.status  || order.status;
    const newAddress = body.address || order.address;
    const isCancelledOrReturned = newStatus === "CANCELLED" || newStatus === "RETURNED";
    const isPickup   = newAddress?.toLowerCase().includes("самовывоз");

    if (isCancelledOrReturned || isPickup) {
      updateData.routeId    = null;
      updateData.routeOrder = null;
    }

    let updatedOrder = order;
    if (Object.keys(updateData).length > 0) {
      updatedOrder = await prisma.order.update({
        where: { id },
        data: updateData,
        include: { route: true },
      });
    }

    // 🔥 ДОБАВЛЕНО: Теперь честно отслеживаем изменения времени, комментариев и товаров
    const changes = {
      statusChanged:    body.status    !== undefined && order.status    !== (updateData.status ?? body.status),
      courierChanged:   body.courier   !== undefined && (order.courierId ?? 0) !== (updateData.courierId ?? 0),
      addressChanged:   body.address   !== undefined && (order.address   ?? "") !== (body.address ?? ""),
      slotChanged:      body.slotRaw   !== undefined && (order.slotRaw   ?? "") !== (body.slotRaw ?? ""),
      commentChanged:   body.comment   !== undefined && (order.comment   ?? "") !== (body.comment ?? ""),
      opCommentChanged: body.opComment !== undefined && (order.opComment ?? "") !== (body.opComment ?? ""),
      itemsChanged:     body.items     !== undefined && (order.items     ?? "") !== (body.items ?? ""),
    };

    if (Object.values(changes).some(Boolean)) {
      notify({
        type: "order.updated",
        order: {
          id:         updatedOrder.id,
          crmId:      updatedOrder.crmId,
          externalId: updatedOrder.externalId,
          courierId:  updatedOrder.courierId,
          address:    updatedOrder.address,
          slotRaw:    updatedOrder.slotRaw,
          courier:    updatedOrder.courier,
          items:      updatedOrder.items,
          status:     updatedOrder.status,
          comment:    updatedOrder.comment,
          opComment:  updatedOrder.opComment,
        } as any,
        previousStatus: changes.statusChanged ? order.status : undefined,
        changes,
      }).catch(console.error);
    }

    // ── CRM синхронизация ──
    let crmStatus = body.status ?? updateData.status;
    if (crmStatus === "ASSIGNED") crmStatus = undefined;

    await updateCrmOrder(order.crmId, {
      status:         crmStatus as OrderStatus | undefined,
      courier:        updateData.courier ?? body.courier,
      opComment:      body.opComment,
      address:        body.address,
      recipientPhone: body.recipientPhone,
    });

    return NextResponse.json(updatedOrder);
  } catch (e) {
    console.error("PATCH /api/orders/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}