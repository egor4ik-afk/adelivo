// src/app/api/orders/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder, updateCrmOrderDeliveryPrice } from "@/lib/crm";
import { OrderStatus } from "@prisma/client";
import { applyUniversalEtaShift } from "@/lib/eta";
import { notify, createManagerPlaque } from "@/lib/notifications"; 

const STORE_COORDS = "55.749511,37.596205";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(req as any);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();

    const order = await prisma.order.findUnique({ where: { id }, include: { route: true } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // 🔥 ЗАЩИТА: Нельзя нажать "В пути" раньше чем за час до базы
    if (body.status === "IN_DELIVERY" && order.route?.baseArrivalTime) {
      const [baseH, baseM] = order.route?.baseArrivalTime.split(':').map(Number);
      const now = new Date();
      const moscowNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
      
      const baseTimeMs = new Date(
        moscowNow.getFullYear(), moscowNow.getMonth(), moscowNow.getDate(), 
        baseH, baseM, 0, 0
      ).getTime();
      
      // Считаем разницу в часах
      const diffHours = (baseTimeMs - moscowNow.getTime()) / (1000 * 60 * 60);
      
      if (diffHours > 1) {
        return NextResponse.json({ 
          error: "Слишком рано! Начать маршрут можно не раньше чем за час до прибытия на базу." 
        }, { status: 400 });
      }
    }

    const updateData: any = {};

    // ОБРАБОТКА ДАТЫ ДОСТАВКИ
    if (body.deliveryDate !== undefined) {
      updateData.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null;
    }

    if (body.status !== undefined) {
      updateData.status = body.status;
      updateData.changedAt = new Date();
      
      if (body.status === "IN_DELIVERY" && (order.status !== "IN_DELIVERY" || !order.pickedUpAt)) {
        updateData.pickedUpAt = new Date();
      }
      
      if (body.status === "NEW") {
        updateData.pickedUpAt = null;
        updateData.eta = null;
        updateData.deliveredAt = null;
      } else if (body.status === "ASSIGNED") {
        updateData.pickedUpAt = null;
        updateData.deliveredAt = null;
      } else if (body.status === "DELIVERED") {
        if (!order.deliveredAt) {
          updateData.deliveredAt = new Date(); 
        }
      }
    }

    if (body.deliveredAt !== undefined) {
      updateData.deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : null;
    }
    
    if (body.eta !== undefined && body.status !== "DELIVERED") {
      updateData.eta = body.eta;
    }
    
    if (body.opComment !== undefined) updateData.opComment = body.opComment;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.recipientPhone !== undefined) updateData.recipientPhone = body.recipientPhone;
    if (body.slotRaw !== undefined) updateData.slotRaw = body.slotRaw;
    if (body.comment !== undefined) updateData.comment = body.comment;
    if (body.items !== undefined) updateData.items = body.items;
    if (body.routeId !== undefined) updateData.routeId = body.routeId;
    if (body.routeOrder !== undefined) updateData.routeOrder = body.routeOrder;
    if (body.costPrice !== undefined) updateData.costPrice = body.costPrice;

    // СНИМАЕМ ФЛАГ ТОЛЬКО ПРИ РУЧНОМ ВВОДЕ ЦЕНЫ
    if (body.price !== undefined) {
      updateData.price = body.price;
      updateData.wrongPrice = false; 
    }

    let finalPrice: number | undefined = body.price;
    if (body.courier !== undefined) {
      if (body.courier) {
        const numericId = Number(body.courier);
        const dbCourier = await prisma.courier.findFirst({
          where: isNaN(numericId) ? { fullName: body.courier } : { id: numericId },
        });
        updateData.courier = dbCourier?.fullName ?? body.courier;
        updateData.courierId = dbCourier?.id ?? null;

        if (dbCourier && dbCourier.id !== order.courierId) {
          let basePrice = order.price && order.price > 0 ? order.price : 500;
          if (order.courierId) {
             const oldCourier = await prisma.courier.findUnique({ where: { id: order.courierId } });
             if (oldCourier?.isAuto && basePrice >= 600) basePrice -= 100;
          }
          finalPrice = basePrice + (dbCourier.isAuto ? 100 : 0);
          updateData.price = finalPrice;
        }
      } else {
        updateData.courier = null; updateData.courierId = null; updateData.courierLink = null;
        if (order.courierId) {
           const oldCourier = await prisma.courier.findUnique({ where: { id: order.courierId } });
           if (oldCourier?.isAuto && order.price && order.price >= 600) {
               finalPrice = order.price - 100;
               updateData.price = finalPrice;
           }
        }
      }
    }

    const rttMode = updateData.courierId 
      ? ((await prisma.courier.findUnique({ where: { id: updateData.courierId } }))?.isAuto ? "auto" : "mt") 
      : "auto";
    const freshCoords = await prisma.order.findUnique({ where: { id }, select: { lat: true, lng: true }});
    const finalCourier = updateData.courier !== undefined ? updateData.courier : order.courier;
    if (finalCourier && (body.courier !== undefined || body.address !== undefined)) {
      if (freshCoords?.lat && freshCoords?.lng) {
        updateData.courierLink = `https://yandex.ru/maps/?mode=routes&rtext=${STORE_COORDS}~${freshCoords.lat},${freshCoords.lng}&rtt=${rttMode}`;
      }
    }

    const newCourierId = updateData.courierId as number | undefined;
    if (newCourierId && newCourierId !== order.courierId) {
      if (order.routeId) {
        const siblingsCount = await prisma.order.count({ where: { routeId: order.routeId, id: { not: id } }});
        if (siblingsCount === 0) await prisma.route.deleteMany({ where: { id: order.routeId } });
      }
      
      const rawDate = updateData.deliveryDate || order.deliveryDate || order.crmCreatedAt || new Date();
      const orderDate = (rawDate instanceof Date ? rawDate : new Date(rawDate))
           .toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
      const routeDay = orderDate.split("-")[2];
      const prefix = `M-${routeDay}`;

      const routes = await prisma.route.findMany({ where: { name: { startsWith: prefix }, date: orderDate }, select: { name: true }});
      let maxNum = 0;
      for (const r of routes) {
        const match = r.name.match(new RegExp(`^${prefix}(\\d+)$`));
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
      const newRoute = await prisma.route.create({
        data: { 
            name: `${prefix}${(maxNum + 1).toString().padStart(3, "0")}`, 
            link: updateData.courierLink, 
            date: orderDate, 
            courierId: newCourierId,
            estimatedReturnTime: body.estimatedReturnTime || null
        },
      });
      updateData.routeId = newRoute.id; updateData.routeOrder = 1;
      if (order.status === "NEW") updateData.status = "ASSIGNED";
    }

    // 🔥 ВОЗВРАЩЕННЫЙ БЛОК: Снятие курьера
    if ((body.courier === "" || body.courier === null) && order.courierId !== null) {
      if (order.status === "ASSIGNED" && body.status === undefined) updateData.status = "NEW";
      updateData.pickedUpAt = null;
      if (order.routeId) {
        const siblingsCount = await prisma.order.count({ where: { routeId: order.routeId, id: { not: id } }});
        if (siblingsCount === 0) await prisma.route.deleteMany({ where: { id: order.routeId } });
        updateData.routeId = null; updateData.routeOrder = null;
      }
    }

    // 🔥 НОВЫЙ БЛОК: Безопасный выход из маршрута при смене даты
    const oldDate = order.deliveryDate ? new Date(order.deliveryDate).toISOString().split('T')[0] : null;
    const newDate = updateData.deliveryDate ? new Date(updateData.deliveryDate).toISOString().split('T')[0] : null;
    const dateChanged = body.deliveryDate !== undefined && oldDate !== newDate;

    if (dateChanged && order.routeId) {
      const siblingsCount = await prisma.order.count({ where: { routeId: order.routeId, id: { not: id } }});
      if (siblingsCount === 0) {
         await prisma.route.deleteMany({ where: { id: order.routeId } });
      }
      updateData.routeId = null; 
      updateData.routeOrder = null;
    }

    if (body.photoUrl !== undefined) updateData.photoUrl = body.photoUrl;

    const finalStatus = updateData.status !== undefined ? updateData.status : order.status;
    const finalCourierId = updateData.courierId !== undefined ? updateData.courierId : order.courierId;
    
    if (finalStatus === "NEW" || finalCourierId === null) {
      updateData.eta = null;
    }

    let updatedOrder = order;
    if (Object.keys(updateData).length > 0) {
      updatedOrder = await prisma.order.update({ where: { id }, data: updateData, include: { route: true } });
    }

    if (body.estimatedReturnTime !== undefined && updatedOrder.routeId) {
      await prisma.route.update({
        where: { id: updatedOrder.routeId },
        data: { estimatedReturnTime: body.estimatedReturnTime }
      });
    }

    const changes = {
      statusChanged:         order.status         !== updatedOrder.status,
      courierChanged:        (order.courierId ?? 0) !== (updatedOrder.courierId ?? 0),
      dateChanged:           dateChanged,
      slotChanged:           (order.slotRaw    ?? "") !== (updatedOrder.slotRaw    ?? ""),
      addressChanged:        (order.address    ?? "") !== (updatedOrder.address    ?? ""),
      commentChanged:        (order.comment    ?? "") !== (updatedOrder.comment    ?? ""),
      opCommentChanged:      (order.opComment  ?? "") !== (updatedOrder.opComment  ?? ""),
      itemsChanged:          (order.items      ?? "") !== (updatedOrder.items      ?? ""),
      recipientPhoneChanged: !!order.recipientPhone && order.recipientPhone.trim() !== "" && order.recipientPhone !== updatedOrder.recipientPhone,

      // 🔥 ЯВНЫЕ ПОЛЯ ДЛЯ ИСТОРИИ ЛОГОВ (Теперь в БД будет видно Было/Стало)
      oldOpComment: order.opComment || "Не было",
      newOpComment: updatedOrder.opComment || "Удалён",
      oldStatus: order.status,
      newStatus: updatedOrder.status,
      oldTime: order.slotRaw || "—",
      newTime: updatedOrder.slotRaw || "—"
    };

    if (Object.values(changes).some(Boolean)) {
      notify({
        type: "order.updated",
        order: updatedOrder as any,
        previousStatus: changes.statusChanged ? order.status : undefined,
        changes, // В логи теперь улетят подробные old/new значения
      }).catch(console.error);
    }

    // 🔥 ДОБАВЛЕНО: Создаем плашку в Табло при изменении комментария
    if (changes.opCommentChanged) {
      try {
        const courierDb = updatedOrder.courierId 
          ? await prisma.courier.findUnique({ where: { id: updatedOrder.courierId } }) 
          : null;
        
        const authorName = user?.firstName 
          ? `${user.firstName} ${user.lastName || ''}`.trim() 
          : "Оператор";

        await createManagerPlaque({
          courierId: courierDb?.id || 'UNASSIGNED',
          courierName: courierDb?.fullName || 'No name', // 🔥 Чисто и логично
          newValue: updatedOrder.opComment || "Удалён",
          oldValue: order.opComment || "Не было",
          changeType: 'OP_COMMENT_ADDED',
          authorName: authorName
        });
      } catch (e: any) {
         console.error("Ошибка вызова плашки коммента:", e);
      }
    }

    const statusChanged = body.status !== undefined && order.status !== body.status;
    if (statusChanged && (body.status === "IN_DELIVERY" || body.status === "DELIVERED")) {
       await applyUniversalEtaShift(id, body.status, body.eta);
    }

    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const proxyUrl = process.env.PROXY_URL; // 🔥 URL прокси

    if (proxyUrl && tgToken && tgChat && body.photoUrl && body.photoUrl !== order.photoUrl) {
        fetch(proxyUrl, {
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            token: tgToken,
            method: "sendPhoto",
            payload: { 
              chat_id: tgChat, 
              photo: body.photoUrl, 
              caption: `📸 *Фото к заказу ${order.externalId || order.crmId}*\n📍 *Адрес:* ${order.address}`, 
              parse_mode: "Markdown" 
            }
          }),
        }).catch(() => {});
    }

    if (finalPrice !== undefined && order.crmId) await updateCrmOrderDeliveryPrice(order.crmId, finalPrice);
    let crmStatus = body.status ?? updateData.status;
    if (crmStatus === "ASSIGNED") crmStatus = undefined;
    
    await updateCrmOrder(order.crmId, { status: crmStatus as OrderStatus | undefined, courier: updateData.courier ?? body.courier, opComment: body.opComment, address: body.address });

    return NextResponse.json(updatedOrder);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}