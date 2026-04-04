// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder, updateCrmOrderDeliveryPrice } from "@/lib/crm"; // 🔥 ДОБАВИЛИ updateCrmOrderDeliveryPrice
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

    if (body.status !== undefined) {
      updateData.status = body.status;
      updateData.changedAt = new Date();
      
      // 🔥 Улучшенное условие: перевели "В пути" — записали время выезда
      if (body.status === "IN_DELIVERY") {
        // Записываем время ТОЛЬКО если статус реально изменился 
        // ИЛИ если время выезда по какой-то причине пустое
        if (order.status !== "IN_DELIVERY" || !order.pickedUpAt) {
          updateData.pickedUpAt = new Date();
        }
      }

      // 🔥 НОВОЕ: Записываем готовое ETA с фронтенда (заполняем один раз)
      if (body.eta !== undefined) {
        // Если в базе ETA ещё пустое — записываем то, что посчитал интерфейс
        if (!order.eta) {
          updateData.eta = body.eta;
        }
      }
      
      // 🔥 Если вернули заказ обратно — очистили время выезда и ETA
      if (body.status === "NEW" || body.status === "ASSIGNED") {
        updateData.pickedUpAt = null;
        updateData.eta = null; // Очищаем ETA, чтобы при новом выезде записать заново
      }

      // ⚡️ ТРИГГЕР ПЕРЕРАСЧЕТА: Если заказ доставили, нужно пересчитать время для остальных
      if (body.status === "DELIVERED" && order.status !== "DELIVERED" && order.routeId) {
        // 🔥 ПЕРЕДАЕМ order.id в функцию
        triggerRouteRecalculation(order.routeId, order.id).catch(console.error);
      }
    }
    
    if (body.opComment      !== undefined) updateData.opComment      = body.opComment;
    if (body.address        !== undefined) updateData.address        = body.address;
    if (body.recipientPhone !== undefined) updateData.recipientPhone = body.recipientPhone;
    
    // 🔥 ДОБАВЛЕНО: обновляем время, комментарии и состав
    if (body.slotRaw        !== undefined) updateData.slotRaw        = body.slotRaw;
    if (body.comment        !== undefined) updateData.comment        = body.comment;
    if (body.items          !== undefined) updateData.items          = body.items;
    if (body.routeId    !== undefined) updateData.routeId    = body.routeId;
    if (body.routeOrder !== undefined) updateData.routeOrder = body.routeOrder;
    if (body.eta !== undefined) updateData.eta = body.eta;

    // 🔥 ДОБАВИЛИ РУЧНУЮ ПРАВКУ ЦЕНЫ И СЕБЕСТОИМОСТИ
    if (body.price      !== undefined) updateData.price      = body.price;
    if (body.costPrice  !== undefined) updateData.costPrice  = body.costPrice;

    let finalPrice: number | undefined; // 🔥 Переменная для отслеживания изменения цены
    
    // Если мы вручную обновили цену, нужно переопределить finalPrice, чтобы он улетел в CRM
    if (body.price !== undefined) finalPrice = body.price;
    // Если мы вручную обновили цену, нужно переопределить finalPrice, чтобы он улетел в CRM
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

        // 🔥 ЛОГИКА АВТО-КУРЬЕРА: пересчет цены (+100 руб)
        if (dbCourier && dbCourier.id !== order.courierId) {
          let basePrice = order.price && order.price > 0 ? order.price : 500;
          
          // Если прошлый курьер УЖЕ был авто, отнимаем его 100р, чтобы получить "чистую" базу
          if (order.courierId) {
             const oldCourier = await prisma.courier.findUnique({ where: { id: order.courierId } });
             if (oldCourier?.isAuto && basePrice >= 600) {
                 basePrice -= 100;
             }
          }

          // Накидываем 100р, если новый курьер на авто
          const autoSurcharge = dbCourier.isAuto ? 100 : 0;
          finalPrice = basePrice + autoSurcharge;
          updateData.price = finalPrice;
        }
      } else {
        updateData.courier     = null;
        updateData.courierId   = null;
        updateData.courierLink = null;

        // 🔥 Если курьера сняли, откатываем цену (убираем надбавку авто)
        if (order.courierId) {
           const oldCourier = await prisma.courier.findUnique({ where: { id: order.courierId } });
           if (oldCourier?.isAuto && order.price && order.price >= 600) {
               finalPrice = order.price - 100;
               updateData.price = finalPrice;
           }
        }
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

    // ── Автосоздание маршрута при назначении или СМЕНЕ курьера ──
    const newCourierId = updateData.courierId as number | undefined;
    const isCourierAssignedOrChanged = newCourierId && newCourierId !== order.courierId;

    if (isCourierAssignedOrChanged) {
      // 1. Если заказ был в другом маршруте, вытаскиваем его оттуда и удаляем пустой маршрут
      if (order.routeId) {
        const siblingsCount = await prisma.order.count({
          where: { routeId: order.routeId, id: { not: id } },
        });
        if (siblingsCount === 0) {
          await prisma.route.deleteMany({ where: { id: order.routeId } });
        }
      }

      // 2. Создаем новый маршрут для нового курьера
      const orderDate = order.deliveryDate
        ? order.deliveryDate.toString().split("T")[0]
        : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

      const routeDay = orderDate.split("-")[2];
      const prefix = `M-${routeDay}`;

      // 🔥 ДОБАВЛЕНО: Безопасный поиск максимального номера маршрута ЗА ЭТОТ ДЕНЬ
      const routes = await prisma.route.findMany({
        where: { 
          name: { startsWith: prefix },
          date: orderDate 
        },
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

      // 3. Отправляем красивый Push новому курьеру
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

    // ── Снятие курьера (если просто очистили поле курьера) ──
    const courierIsBeingRemoved = (body.courier === "" || body.courier === null) && order.courierId !== null;
        
    if (courierIsBeingRemoved) {
      // 1. Откатываем статус на "Новый"
      if (order.status === "ASSIGNED" && body.status === undefined) {
        updateData.status = "NEW";
      }
      
      // 🔥 ДОБАВЛЕНО: Очищаем время выезда, так как курьер снят
      updateData.pickedUpAt = null;

      // 2. Убираем из маршрута и удаляем маршрут, если он стал пустым
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

    // ── Автовыброс из маршрута ──
    const newStatus  = body.status  || order.status;
    const newAddress = body.address || order.address;
    const isCancelledOrReturned = newStatus === "CANCELLED" || newStatus === "RETURNED";
    const isPickup   = newAddress?.toLowerCase().includes("самовывоз");

    if (isCancelledOrReturned || isPickup) {
      // Если заказ выкидывается из маршрута из-за отмены/самовывоза,
      // также нужно проверить, не остался ли маршрут пустым!
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

    // 🔥 ДОБАВЛЕНО: Обработка фото (сохраняем одну ссылку в БД, если есть поле)
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

    // 🔥 ДОБАВЛЕНО: Уведомление в Telegram о фото
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (tgToken && tgChat) {
      // 1. Уведомление об 1 фото (если передано photoUrl)
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


      // 3. Уведомление об опоздании (если ETA > slotTo на 30 мин)
      if (body.eta && order.slotTo && body.eta !== order.eta) {
        const [etaH, etaM] = body.eta.split(':').map(Number);
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
              `🕒 *Расчетное (ETA):* ${body.eta}`
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

    // 🔥 ДОБАВЛЕНО: Теперь честно отслеживаем изменения времени, комментариев и товаров
    const changes = {
      statusChanged:    body.status    !== undefined && order.status    !== (updateData.status ?? body.status),
      courierChanged:   body.courier   !== undefined && (order.courierId ?? 0) !== (updateData.courierId ?? 0),
      addressChanged:   body.address   !== undefined && (order.address   ?? "") !== (body.address ?? ""),
      slotChanged:      body.slotRaw   !== undefined && (order.slotRaw   ?? "") !== (body.slotRaw ?? ""),
      commentChanged:   body.comment   !== undefined && (order.comment   ?? "") !== (body.comment ?? ""),
      opCommentChanged: body.opComment !== undefined && (order.opComment ?? "") !== (body.opComment ?? ""),
      itemsChanged:     body.items     !== undefined && (order.items     ?? "") !== (body.items ?? ""),
      // 🔥 ДОБАВИЛ
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

    // 🔥 Отправляем обновленную цену в CRM, если она изменилась из-за авто-курьера
    if (finalPrice !== undefined && order.crmId) {
      await updateCrmOrderDeliveryPrice(order.crmId, finalPrice);
    }

    return NextResponse.json(updatedOrder);
  } catch (e) {
    console.error("PATCH /api/orders/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// 🔥 Функция для сдвига ETA у оставшихся точек в маршруте
async function triggerRouteRecalculation(routeId: string, deliveredOrderId: string) {
  try {
    console.log(`[ETA] Запуск перерасчета маршрута ${routeId} после доставки точки ${deliveredOrderId}...`);

    // 1. Находим заказ, который только что доставили
    const deliveredOrder = await prisma.order.findUnique({ 
      where: { id: deliveredOrderId },
      select: { eta: true, routeOrder: true }
    });

    if (!deliveredOrder || !deliveredOrder.eta || deliveredOrder.routeOrder === null) {
      console.log(`[ETA] Нет первоначального ETA или порядкового номера (routeOrder). Перерасчет отменен.`);
      return;
    }

    // 2. Вычисляем разницу между ПЛАНОМ (ETA) и ФАКТОМ (текущее время)
    const [etaH, etaM] = deliveredOrder.eta.split(':').map(Number);
    if (isNaN(etaH) || isNaN(etaM)) return;

    const now = new Date();
    const plannedTime = new Date();
    plannedTime.setHours(etaH, etaM, 0, 0);

    // Разница в миллисекундах -> переводим в минуты
    const diffMs = now.getTime() - plannedTime.getTime();
    const diffMinutes = Math.round(diffMs / 60000);

    if (diffMinutes === 0) {
      console.log(`[ETA] Курьер доставил вовремя, сдвиг не требуется.`);
      return; 
    }

    // 3. Получаем все ПОСЛЕДУЮЩИЕ не доставленные точки этого маршрута
    const futureOrders = await prisma.order.findMany({
      where: {
        routeId,
        routeOrder: { gt: deliveredOrder.routeOrder }, // строго больше, чем номер доставленного
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

      // Прибавляем (или отнимаем, если приехал раньше) разницу
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