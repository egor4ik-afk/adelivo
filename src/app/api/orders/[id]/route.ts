// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder } from "@/lib/crm";
import { notify } from "@/lib/notifications";
import { OrderStatus } from "@prisma/client";

const STORE_COORDS = "55.749511,37.596205"; // База

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

    // Поддержка ручного назначения/удаления маршрута с фронтенда
    if (body.routeId    !== undefined) updateData.routeId    = body.routeId;
    if (body.routeOrder !== undefined) updateData.routeOrder = body.routeOrder;

    if (body.courier !== undefined) {
      if (body.courier) {
        // Ищем по fullName ИЛИ по числовому id
        const numericId = Number(body.courier);
        const dbCourier = await prisma.courier.findFirst({
          where: isNaN(numericId)
            ? { fullName: body.courier }
            : { id: numericId },
        });
        updateData.courier   = dbCourier?.fullName ?? body.courier;
        updateData.courierId = dbCourier?.id ?? null;
      } else {
        // Снятие курьера
        updateData.courier     = null;
        updateData.courierId   = null;
        updateData.courierLink = null;
      }
    }

    // Генерация ссылки для курьера
    const finalCourier = updateData.courier !== undefined ? updateData.courier : order.courier;
    const isCourierChanged = body.courier !== undefined && body.courier !== null;
    // Адрес мог обновиться через /fix до этого PATCH — перечитываем свежие координаты из БД
    const isAddressChanged = body.address !== undefined;

    if (finalCourier && (isCourierChanged || isAddressChanged)) {
      // Всегда берём актуальные координаты из БД (не из body и не из старого snapshot)
      // /fix уже мог записать новые lat/lng до того как пришёл этот PATCH
      const freshOrder = await prisma.order.findUnique({
        where: { id },
        select: { lat: true, lng: true },
      });
      const finalLat = freshOrder?.lat;
      const finalLng = freshOrder?.lng;
      if (finalLat && finalLng) {
        updateData.courierLink = `https://yandex.ru/maps/?mode=routes&rtext=${STORE_COORDS}~${finalLat},${finalLng}&rtt=auto`;
      }
    }

    // Если назначили курьера, но координат ещё нет — всё равно пересчитаем ссылку
    // когда геокодирование завершится (geocodeNewOrders обновит lat/lng, но ссылку не пересчитает)
    // Поэтому если адрес есть, а координат нет — ссылку не пишем (лучше null чем старая)

    // Автоматический выброс из маршрута при отмене/возврате/самовывозе
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

    // ── Push-уведомления о ручных изменениях оператора ──
    const changes = {
      statusChanged:    body.status      !== undefined && order.status      !== body.status,
      courierChanged:   body.courier     !== undefined && (order.courierId ?? 0) !== (updateData.courierId ?? 0),
      addressChanged:   body.address     !== undefined && (order.address    ?? "") !== (body.address ?? ""),
      slotChanged:      false, // слот меняется только через CRM
      commentChanged:   false, // комментарий клиента не меняется отсюда
      opCommentChanged: body.opComment   !== undefined && (order.opComment  ?? "") !== (body.opComment ?? ""),
      itemsChanged:     false,
    };

    if (Object.values(changes).some(Boolean)) {
      notify({
        type: "order.updated",
        order: {
          id: updatedOrder.id,
          crmId: updatedOrder.crmId,
          externalId: updatedOrder.externalId,
          courierId: updatedOrder.courierId,      // ← курьер для матчинга в notifications.ts
          address: updatedOrder.address,
          slotRaw: updatedOrder.slotRaw,
          courier: updatedOrder.courier,
          items: updatedOrder.items,
          status: updatedOrder.status,
          comment: updatedOrder.comment,
          opComment: updatedOrder.opComment,
        } as any,
        previousStatus: changes.statusChanged ? order.status : undefined,
        changes,
      }).catch(console.error);
    }

    // CRM синхронизация (ASSIGNED не отправляем)
    let crmStatus = body.status;
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