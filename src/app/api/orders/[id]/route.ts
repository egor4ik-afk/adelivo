// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder, updateCrmOrderDeliveryPrice } from "@/lib/crm";
import { notify } from "@/lib/notifications";
import { OrderStatus } from "@prisma/client";

const STORE_COORDS = "55.749511,37.596205";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(req as any);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    // ── ПЕРЕМЕННЫЕ ДЛЯ СДВИГА МАРШРУТА "В ПУТИ" ──
    let inDeliveryDiff = 0;
    let triggerInDeliveryShift = false;

    if (body.status !== undefined) {
      updateData.status = body.status;
      updateData.changedAt = new Date();
      
      // 🚀 ЛОГИКА "В ПУТИ"
      if (body.status === "IN_DELIVERY") {
        if (order.status !== "IN_DELIVERY" || !order.pickedUpAt) {
          updateData.pickedUpAt = new Date();
        }

        // Если пришло новое ETA от интерфейса
        if (body.eta) {
           updateData.eta = body.eta;
           // Считаем разницу ДО ТОГО как сохраним новое значение в базу
           if (order.eta && order.status !== "IN_DELIVERY") {
               const [oldH, oldM] = order.eta.split(':').map(Number);
               const [newH, newM] = body.eta.split(':').map(Number);
               if (!isNaN(oldH) && !isNaN(newH)) {
                  inDeliveryDiff = (newH * 60 + newM) - (oldH * 60 + oldM);
                  triggerInDeliveryShift = true;
               }
           }
        }
      }
      
      // ↩️ СБРОС
      if (body.status === "NEW" || body.status === "ASSIGNED") {
        updateData.pickedUpAt = null;
        updateData.eta = null;
      }
    }
    
    // Если просто руками правим ETA, без смены статуса
    if (body.eta !== undefined && body.status !== "IN_DELIVERY") {
       updateData.eta = body.eta;
    }

    if (body.opComment      !== undefined) updateData.opComment      = body.opComment;
    if (body.address        !== undefined) updateData.address        = body.address;
    if (body.recipientPhone !== undefined) updateData.recipientPhone = body.recipientPhone;
    
    if (body.slotRaw        !== undefined) updateData.slotRaw        = body.slotRaw;
    if (body.comment        !== undefined) updateData.comment        = body.comment;
    if (body.items          !== undefined) updateData.items          = body.items;
    if (body.routeId    !== undefined) updateData.routeId    = body.routeId;
    if (body.routeOrder !== undefined) updateData.routeOrder = body.routeOrder;

    if (body.price      !== undefined) updateData.price      = body.price;
    if (body.costPrice  !== undefined) updateData.costPrice  = body.costPrice;

    let finalPrice: number | undefined; 
    if (body.price !== undefined) finalPrice = body.price;
    
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

        if (dbCourier && dbCourier.id !== order.courierId) {
          let basePrice = order.price && order.price > 0 ? order.price : 500;
          
          if (order.courierId) {
             const oldCourier = await prisma.courier.findUnique({ where: { id: order.courierId } });
             if (oldCourier?.isAuto && basePrice >= 600) {
                 basePrice -= 100;
             }
          }

          const autoSurcharge = dbCourier.isAuto ? 100 : 0;
          finalPrice = basePrice + autoSurcharge;
          updateData.price = finalPrice;
        }
      } else {
        updateData.courier     = null;
        updateData.courierId   = null;
        updateData.courierLink = null;

        if (order.courierId) {
           const oldCourier = await prisma.courier.findUnique({ where: { id: order.courierId } });
           if (oldCourier?.isAuto && order.price && order.price >= 600) {
               finalPrice = order.price - 100;
               updateData.price = finalPrice;
           }
        }
      }
    }

    const freshCoords = await prisma.order.findUnique({
      where: { id },
      select: { lat: true, lng: true },
    });
    const freshLat = freshCoords?.lat;
    const freshLng = freshCoords?.lng;

    const finalCourier = updateData.courier !== undefined ? updateData.courier : order.courier;
    const isCourierChanged = body.courier !== undefined && body.courier !== null;
    const isAddressChanged = body.address !== undefined;

    if (finalCourier && (isCourierChanged || isAddressChanged)) {
      if (freshLat && freshLng) {
        updateData.courierLink = `https://yandex.ru/maps/?mode=routes&rtext=${STORE_COORDS}~${freshLat},${freshLng}&rtt=auto`;
      }
    }

    const newCourierId = updateData.courierId as number | undefined;
    const isCourierAssignedOrChanged = newCourierId && newCourierId !== order.courierId;

    if (isCourierAssignedOrChanged) {
      if (order.routeId) {
        const siblingsCount = await prisma.order.count({
          where: { routeId: order.routeId, id: { not: id } },
        });
        if (siblingsCount === 0) {
          await prisma.route.deleteMany({ where: { id: order.routeId } });
        }
      }

      const orderDate = order.deliveryDate
        ? order.deliveryDate.toString().split("T")[0]
        : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

      const routeDay = orderDate.split("-")[2];
      const prefix = `M-${routeDay}`;

      const routes = await prisma.route.findMany({
        where: { name: { startsWith: prefix }, date: orderDate },
        select: { name: true }
      });

      let maxNum = 0;
      for (const r of routes) {
        const match = r.name.match(new RegExp(`^${prefix}(\\d+)$`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }

      const routeName = `${prefix}${(maxNum + 1).toString().padStart(3, "0")}`;
      const routeLink = freshLat && freshLng
        ? `https://yandex.ru/maps/?rtext=${STORE_COORDS}~${freshLat},${freshLng}&rtt=auto`
        : null;

      const newRoute = await prisma.route.create({
        data: { name: routeName, link: routeLink, date: orderDate, courierId: newCourierId },
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
          notify({ type: "route.assigned", userId: courierUser.id, routeId: routeName, pointsCount: 1 }).catch(console.error);
        }
      }
    }

    const courierIsBeingRemoved = (body.courier === "" || body.courier === null) && order.courierId !== null;
        
    if (courierIsBeingRemoved) {
      if (order.status === "ASSIGNED" && body.status === undefined) {
        updateData.status = "NEW";
      }
      updateData.pickedUpAt = null;

      if (order.routeId) {
        const siblingsCount = await prisma.order.count({
          where: { routeId: order.routeId, id: { not: id } },
        });
        if (siblingsCount === 0) {
          await prisma.route.deleteMany({ where: { id: order.routeId } });
        }
        updateData.routeId    = null;
        updateData.routeOrder = null;
      }
    }

    const newStatus  = body.status  || order.status;
    const newAddress = body.address || order.address;
    const isCancelledOrReturned = newStatus === "CANCELLED" || newStatus === "RETURNED";
    const isPickup   = newAddress?.toLowerCase().includes("самовывоз");

    if (isCancelledOrReturned || isPickup) {
      if (order.routeId && updateData.routeId !== null) {
        const siblingsCount = await prisma.order.count({
          where: { routeId: order.routeId, id: { not: id } },
        });
        if (siblingsCount === 0) {
          await prisma.route.deleteMany({ where: { id: order.routeId } });
        }
      }
      updateData.routeId    = null;
      updateData.routeOrder = null;
    }

    if (body.photoUrl !== undefined) {
       updateData.photoUrl = body.photoUrl;
    }

    let updatedOrder = order;
    if (Object.keys(updateData).length > 0) {
      updatedOrder = await prisma.order.update({
        where: { id },
        data: updateData,
        include: { route: true },
      });
    }

    // ⚡️ ВЫЗОВ ТВОЕЙ ФУНКЦИИ СДВИГА МАРШРУТОВ
    if (updatedOrder.routeId) {
      if (body.status === "DELIVERED" && order.status !== "DELIVERED") {
         // Для "Доставлен" вызываем классически — разница вычисляется внутри
         triggerRouteRecalculation(updatedOrder.routeId, updatedOrder.id).catch(console.error);
      } else if (triggerInDeliveryShift) {
         // Для "В пути" передаем уже посчитанную нами разницу
         triggerRouteRecalculation(updatedOrder.routeId, updatedOrder.id, inDeliveryDiff).catch(console.error);
      }
    }

    // ── УВЕДОМЛЕНИЯ TELEGRAM ──
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (tgToken && tgChat) {
      if (body.photoUrl && body.photoUrl !== order.photoUrl) {
        fetch(`https://api.telegram.org/bot${tgToken}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            chat_id: tgChat, 
            photo: body.photoUrl,
            caption: `📸 *Фото к заказу ${order.externalId || order.crmId}*\n📍 *Адрес:* ${order.address}`,
            parse_mode: "Markdown" 
          }),
        }).catch(e => console.error("[TG] Ошибка отправки 1 фото:", e));
      }

      // Уведомление об опоздании
      const currentEta = updateData.eta || order.eta;
      if (currentEta && order.slotTo && currentEta !== order.eta) {
        const [etaH, etaM] = currentEta.split(':').map(Number);
        const [planH, planM] = order.slotTo.split(':').map(Number);
        
        if (!isNaN(etaH) && !isNaN(planH)) {
          const etaMins = (etaH * 60) + (etaM || 0);
          const planMins = (planH * 60) + (planM || 0);
          
          if (etaMins - planMins >= 30) {
            const msg = [
              `⚠️ *Опоздание на точку (>30 мин)*`,
              ``,
              `📦 *Заказ:* ${order.externalId || order.crmId}`,
              `📍 *Адрес:* ${order.address}`,
              `🎯 *План (до):* ${order.slotTo}`,
              `🕒 *Расчетное (ETA):* ${currentEta}`
            ].join("\n");

            fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: "Markdown" }),
            }).catch(e => console.error("[TG] Ошибка уведомления об опоздании:", e));
          }
        }
      }
    }

    const changes = {
      statusChanged:    body.status    !== undefined && order.status    !== (updateData.status ?? body.status),
      courierChanged:   body.courier   !== undefined && (order.courierId ?? 0) !== (updateData.courierId ?? 0),
      addressChanged:   body.address   !== undefined && (order.address   ?? "") !== (body.address ?? ""),
      slotChanged:      body.slotRaw   !== undefined && (order.slotRaw   ?? "") !== (body.slotRaw ?? ""),
      commentChanged:   body.comment   !== undefined && (order.comment   ?? "") !== (body.comment ?? ""),
      opCommentChanged: body.opComment !== undefined && (order.opComment ?? "") !== (body.opComment ?? ""),
      itemsChanged:     body.items     !== undefined && (order.items     ?? "") !== (body.items ?? ""),
      recipientPhoneChanged: body.recipientPhone !== undefined && (order.recipientPhone ?? "") !== (body.recipientPhone ?? ""),
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

    let crmStatus = body.status ?? updateData.status;
    if (crmStatus === "ASSIGNED") crmStatus = undefined;

    await updateCrmOrder(order.crmId, {
      status:         crmStatus as OrderStatus | undefined,
      courier:        updateData.courier ?? body.courier,
      opComment:      body.opComment,
      address:        body.address,
      recipientPhone: body.recipientPhone,
    });

    if (finalPrice !== undefined && order.crmId) {
      await updateCrmOrderDeliveryPrice(order.crmId, finalPrice);
    }

    return NextResponse.json(updatedOrder);
  } catch (e) {
    console.error("PATCH /api/orders/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// 🔥 Твоя функция перерасчета (восстановлена и прокачана)
async function triggerRouteRecalculation(routeId: string, orderId: string, forcedDiffMinutes?: number) {
  try {
    console.log(`[ETA] Запуск перерасчета маршрута ${routeId} от точки ${orderId}...`);

    // 1. Находим заказ (нам нужен его порядковый номер и ETA)
    const targetOrder = await prisma.order.findUnique({ 
      where: { id: orderId },
      select: { eta: true, routeOrder: true }
    });

    if (!targetOrder || !targetOrder.eta || targetOrder.routeOrder === null) {
      console.log(`[ETA] Нет первоначального ETA или порядкового номера (routeOrder). Перерасчет отменен.`);
      return;
    }

    let diffMinutes = 0;

    // 2. Вычисляем разницу
    if (forcedDiffMinutes !== undefined) {
       // Если мы вызвали функцию из статуса "В пути", используем вычисленную разницу
       diffMinutes = forcedDiffMinutes;
    } else {
       // ТВОЙ КОД: Вычисляем разницу между ПЛАНОМ (ETA) и ФАКТОМ (текущее время) для статуса Доставлен
       const [etaH, etaM] = targetOrder.eta.split(':').map(Number);
       if (isNaN(etaH) || isNaN(etaM)) return;

       const now = new Date();
       const plannedTime = new Date();
       plannedTime.setHours(etaH, etaM, 0, 0);

       // Разница в миллисекундах -> переводим в минуты
       const diffMs = now.getTime() - plannedTime.getTime();
       diffMinutes = Math.round(diffMs / 60000);
    }

    if (diffMinutes === 0) {
      console.log(`[ETA] Сдвиг не требуется.`);
      return; 
    }

    // 3. Получаем все ПОСЛЕДУЮЩИЕ не доставленные точки этого маршрута
    const futureOrders = await prisma.order.findMany({
      where: {
        routeId,
        routeOrder: { gt: targetOrder.routeOrder }, // строго больше, чем номер текущего
        status: { in: ["NEW", "ASSIGNED", "IN_DELIVERY"] }
      }
    });

    if (futureOrders.length === 0) return;

    // 4. Сдвигаем время у каждой последующей точки
    for (const o of futureOrders) {
      if (!o.eta) continue;

      const [h, m] = o.eta.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) continue;

      const oldEtaTime = new Date();
      oldEtaTime.setHours(h, m, 0, 0);

      // Прибавляем (или отнимаем) разницу
      const newEtaTime = new Date(oldEtaTime.getTime() + diffMinutes * 60000);
      
      const newH = newEtaTime.getHours().toString().padStart(2, "0");
      const newM = newEtaTime.getMinutes().toString().padStart(2, "0");
      const newEtaStr = `${newH}:${newM}`;

      // Сохраняем в БД новое время
      await prisma.order.update({
        where: { id: o.id },
        data: { eta: newEtaStr }
      });
    }

    console.log(`[ETA] Успешно сдвинули ${futureOrders.length} точек на ${diffMinutes} минут.`);
  } catch (err) {
    console.error(`[ETA] Ошибка при перерасчете маршрута:`, err);
  }
}