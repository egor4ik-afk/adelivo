// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder } from "@/lib/crm";
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
        // 🔥 Ищем по fullName ИЛИ по числовому id (защита если фронт прислал id вместо имени)
        const numericId = Number(body.courier);
        const dbCourier = await prisma.courier.findFirst({
          where: isNaN(numericId)
            ? { fullName: body.courier }  // прислали имя → ищем по имени
            : { id: numericId },          // прислали id  → ищем по id
        });
        updateData.courier   = dbCourier?.fullName ?? body.courier;
        updateData.courierId = dbCourier?.id ?? null;
      } else {
        // Снятие курьера — очищаем и ссылку тоже
        updateData.courier   = null;
        updateData.courierId = null;
        updateData.courierLink = null; 
      }
    }

    // 🔥 ГЕНЕРАЦИЯ ССЫЛКИ (ТЕПЕРЬ РАБОТАЕТ ПРАВИЛЬНО!)
    // Проверяем: есть ли вообще курьер на заказе (новый или уже был)
    const finalCourier = updateData.courier !== undefined ? updateData.courier : order.courier;
    
    // Проверяем: поменялся ли адрес или координаты?
    const isAddressChanged = body.address !== undefined || body.lat !== undefined || body.lng !== undefined;
    // Проверяем: поменялся ли курьер?
    const isCourierChanged = body.courier !== undefined && body.courier !== null;

    // Если есть курьер, и при этом обновили либо курьера, либо адрес -> пересобираем чистую ссылку
    if (finalCourier && (isCourierChanged || isAddressChanged)) {
      // Если перед этим отработал запрос /fix, то order.lat уже содержит новые свежие координаты!
      const finalLat = body.lat ?? order.lat;
      const finalLng = body.lng ?? order.lng;

      if (finalLat && finalLng) {
        updateData.courierLink = `https://yandex.ru/maps/?mode=routes&rtext=${STORE_COORDS}~${finalLat},${finalLng}&rtt=auto`;
      }
    }

    // АВТОМАТИЧЕСКИЙ ВЫБРОС ИЗ МАРШРУТА при отмене/возврате/самовывозе
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

    // Фильтруем статусы перед отправкой в CRM (ASSIGNED не отправляем)
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