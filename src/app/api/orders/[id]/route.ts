// src/app/api/orders/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStorageUrl } from "@/lib/file-url";
import { getSession } from "@/lib/auth";
import { updateCrmOrder, updateCrmOrderDeliveryPrice } from "@/lib/crm";
import { OrderStatus } from "@prisma/client";
import { applyUniversalEtaShift } from "@/lib/eta";
import { notify, createManagerPlaque } from "@/lib/notifications";
import { recalcRouteOfOrder } from "@/lib/route-order";

// Координаты базы берутся из магазина заказа. Значение ниже — запасное,
// на случай незаполненной базы: раньше оно было единственным, и маршрут
// любого магазина строился от адреса Банча.
import { getCity } from "@/lib/cities";

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

      if (body.status === "NEW" || body.status === "ASSEMBLING") {
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
    const freshCoords = await prisma.order.findUnique({
      where: { id },
      select: { lat: true, lng: true, shopRef: { select: { storeLat: true, storeLng: true, city: true } } },
    });

    const shopBase = freshCoords?.shopRef;
    const storeCoords =
      shopBase?.storeLat != null && shopBase?.storeLng != null
        ? `${shopBase.storeLat},${shopBase.storeLng}`
        // База не заполнена — берём центр города магазина, а не Пресню
        : getCity(shopBase?.city).center.join(",");
    const finalCourier = updateData.courier !== undefined ? updateData.courier : order.courier;
    if (finalCourier && (body.courier !== undefined || body.address !== undefined)) {
      if (freshCoords?.lat && freshCoords?.lng) {
        updateData.courierLink = `https://yandex.ru/maps/?mode=routes&rtext=${storeCoords}~${freshCoords.lat},${freshCoords.lng}&rtt=${rttMode}`;
      }
    }

    const newCourierId = updateData.courierId as number | undefined;
    if (newCourierId && newCourierId !== order.courierId) {
      if (order.routeId) {
        const siblingsCount = await prisma.order.count({ where: { routeId: order.routeId, id: { not: id } } });
        if (siblingsCount === 0) await prisma.route.deleteMany({ where: { id: order.routeId } });
      }

      // 🔥 СТРОГАЯ НОРМАЛИЗАЦИЯ ДАТЫ (Как в массовом назначении)
      const rawDate = updateData.deliveryDate || order.deliveryDate || order.crmCreatedAt || new Date();
      let orderDate = "";
      const d = new Date(rawDate);

      if (!isNaN(d.getTime())) {
        orderDate = d.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
      } else {
        orderDate = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
      }
      // Оставляем только чистый YYYY-MM-DD
      orderDate = orderDate.split('T')[0].split(' ')[0];

      const routeDay = orderDate.split("-")[2];
      const prefix = `M-${routeDay}`;

      // 🔥 Ищем СТРОГО по очищенной дате
      const routes = await prisma.route.findMany({
        where: { date: orderDate, name: { startsWith: prefix } },
        select: { name: true }
      });

      let maxNum = 0;
      for (const r of routes) {
        const match = r.name.match(new RegExp(`^${prefix}(\\d+)$`));
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }

      const newRouteName = `${prefix}${(maxNum + 1).toString().padStart(3, "0")}`;

      const newRoute = await prisma.route.create({
        data: {
          name: newRouteName,
          link: updateData.courierLink,
          date: orderDate, // 🔥 СОХРАНЯЕМ ИМЕННО ЭТУ ОЧИЩЕННУЮ ДАТУ
          courierId: newCourierId,
          estimatedReturnTime: body.estimatedReturnTime || null
        },
      });
      updateData.routeId = newRoute.id; updateData.routeOrder = 1;
      // 🔥 Переводим в ASSIGNED только новые заказы. "В сборке" остается нетронутым.
      if (order.status === "NEW") updateData.status = "ASSIGNED";
    }

    // 🔥 ВОЗВРАЩЕННЫЙ БЛОК: Снятие курьера
    if ((body.courier === "" || body.courier === null) && order.courierId !== null) {
      // 🔥 Статус больше не откатывается, живет своей жизнью
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
      const siblingsCount = await prisma.order.count({ where: { routeId: order.routeId, id: { not: id } } });
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
      statusChanged: order.status !== updatedOrder.status,
      courierChanged: (order.courierId ?? 0) !== (updatedOrder.courierId ?? 0),
      dateChanged: dateChanged,
      slotChanged: (order.slotRaw ?? "") !== (updatedOrder.slotRaw ?? ""),
      addressChanged: (order.address ?? "") !== (updatedOrder.address ?? ""),
      commentChanged: (order.comment ?? "") !== (updatedOrder.comment ?? ""),
      opCommentChanged: (order.opComment ?? "") !== (updatedOrder.opComment ?? ""),
      itemsChanged: (order.items ?? "") !== (updatedOrder.items ?? ""),
      recipientPhoneChanged: !!order.recipientPhone && order.recipientPhone.trim() !== "" && order.recipientPhone !== updatedOrder.recipientPhone,

      // 🔥 ЯВНЫЕ ПОЛЯ ДЛЯ ИСТОРИИ ЛОГОВ (Теперь в БД будет видно Было/Стало)
      oldOpComment: order.opComment || "Не было",
      newOpComment: updatedOrder.opComment || "Удалён",
      oldStatus: order.status,
      newStatus: updatedOrder.status,
      oldTime: order.slotRaw || "—",
      newTime: updatedOrder.slotRaw || "—"
    };

    // 🔥 Собираем в массив ТОЛЬКО булевые флаги изменений
    const hasRealChanges = [
      changes.statusChanged,
      changes.courierChanged,
      changes.dateChanged,
      changes.slotChanged,
      changes.addressChanged,
      changes.commentChanged,
      changes.opCommentChanged,
      changes.itemsChanged,
      changes.recipientPhoneChanged
    ].some(Boolean);

    // Уведомляем только если реально что-то изменилось.
    // Блок был продублирован — на каждое изменение уходило по два
    // одинаковых уведомления. Оставлен один вызов.
    if (hasRealChanges) {
      notify({
        type: "order.updated",
        order: updatedOrder as any,
        previousStatus: changes.statusChanged ? order.status : undefined,
        changes,
      }).catch(console.error);
    }

    // 🔥 ГЕНЕРАЦИЯ ПЛАШЕК ИЗ КАРТОЧКИ ЗАКАЗА
    const authorName = user?.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : "Оператор";

    // Умно достаем название маршрута (если курьера сняли, берем из старого состояния)
    const routeName = updatedOrder.route?.name || order.route?.name || null;

    // 1. Плашка изменения комментария
    if (changes.opCommentChanged) {
      try {
        const courierDb = updatedOrder.courierId
          ? await prisma.courier.findUnique({ where: { id: updatedOrder.courierId } })
          : null;

        await createManagerPlaque({
          courierId: courierDb?.id || 'UNASSIGNED',
          courierName: courierDb?.fullName || 'Без курьера',
          routeName: routeName, // 🔥 ПЕРЕДАЕМ МАРШРУТ
          newValue: updatedOrder.opComment || "Удалён",
          oldValue: order.opComment || "Не было",
          changeType: 'OP_COMMENT_ADDED',
          authorName: authorName
        });
      } catch (e: any) {
        console.error("Ошибка вызова плашки комментария:", e);
      }
    }

    // 2. 🔥 НОВОЕ: Плашка смены курьера из карточки заказа
    if (changes.courierChanged) {
      try {
        const oldCourierDb = order.courierId
          ? await prisma.courier.findUnique({ where: { id: order.courierId } })
          : null;
        const newCourierDb = updatedOrder.courierId
          ? await prisma.courier.findUnique({ where: { id: updatedOrder.courierId } })
          : null;

        // Вешаем плашку на нового курьера (если назначили) или на старого (если сняли)
        const targetCourier = newCourierDb || oldCourierDb;

        await createManagerPlaque({
          courierId: targetCourier?.id || 'UNASSIGNED',
          courierName: targetCourier?.fullName || 'Без курьера',
          routeName: routeName, // 🔥 ПЕРЕДАЕМ МАРШРУТ
          newValue: `👤 ${newCourierDb?.fullName || 'Без курьера'}`,
          oldValue: `👤 ${oldCourierDb?.fullName || 'Без курьера'}`,
          changeType: 'COURIER_CHANGED',
          authorName: authorName
        });
      } catch (e: any) {
        console.error("Ошибка вызова плашки курьера:", e);
      }
    }
    const statusChanged = body.status !== undefined && order.status !== body.status;
    if (statusChanged && (body.status === "IN_DELIVERY" || body.status === "DELIVERED")) {
      await applyUniversalEtaShift(id, body.status, body.eta);
    }

    // Точку закрыли — пересобираем порядок маршрута.
    // Если доставили не первую, она встаёт наверх, а остальные
    // перенумеровываются от неё: сначала ближайшее временное окно, потом близость.
    if (statusChanged && ["DELIVERED", "RETURNED", "CANCELLED"].includes(body.status)) {
      await recalcRouteOfOrder(id);
    }

    // Фото доставки → в Telegram админу.
    // Отправляем напрямую в api.telegram.org, как в /api/request
    // и /api/auth/link-courier. Прокси убран: он был третьей точкой отказа,
    // про которую в логах не было ни слова.
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const photoAdded = !!body.photoUrl && body.photoUrl !== order.photoUrl;

    if (photoAdded) {
      if (!tgToken || !tgChat) {
        // Раньше блок молча пропускался — понять, почему фото не приходит,
        // по логам было невозможно
        const missing = [!tgToken && "TELEGRAM_BOT_TOKEN", !tgChat && "TELEGRAM_ADMIN_CHAT_ID"]
          .filter(Boolean).join(", ");
        console.warn(`[Photo] Не отправлено в Telegram, не задано: ${missing}`);
      } else {
        // Ссылка на файл: в базе она может быть ещё старой, через
        // cdn.relaxdev.ru. Приводим к адресу хранилища — по нему Telegram
        // сам строит превью, и картинка снова видна в чате.
        const photoUrl = toStorageUrl(body.photoUrl, process.env.YANDEX_BUCKET_NAME || "izipost");

        // Без Markdown: в адресах и именах файлов попадаются _ и *, на
        // которых разбор падает, и сообщение не уходило вовсе.
        const text =
          `📸 Фото к заказу ${order.externalId || order.crmId}\n` +
          `📍 Адрес: ${order.address || "—"}` +
          (updatedOrder.courier ? `\n🚚 Курьер: ${updatedOrder.courier}` : "") +
          `\n\n${photoUrl}`;

        // Не блокируем ответ курьеру: телефон должен получить ответ сразу,
        // а доставка сообщения админу может занять секунды
        void (async () => {
          try {
            const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: tgChat, text }),
            });
            if (!res.ok) {
              console.error("[Photo] Telegram sendMessage:", res.status, await res.text().catch(() => ""));
            }
          } catch (e) {
            console.error("[Photo] Telegram недоступен:", e);
          }
        })();
      }
    }

    if (finalPrice !== undefined && order.crmId) await updateCrmOrderDeliveryPrice(order.crmId, finalPrice);
    let crmStatus = body.status ?? updateData.status;
    if (crmStatus === "ASSIGNED") crmStatus = undefined;

    await updateCrmOrder(order.crmId, {
      status: crmStatus as OrderStatus | undefined,
      courier: updateData.courier ?? body.courier,
      // Id курьера у нас уже есть — передаём его, чтобы CRM не искала
      // человека по имени и не сохраняла заказ без курьера
      courierId: (updateData.courierId as number | null | undefined) ?? undefined,
      opComment: body.opComment,
      address: body.address,
    }).catch((e) => {
      console.error(`[Order] Не удалось обновить заказ ${order.crmId} в CRM:`, e?.response?.data ?? e?.message);
    });

    return NextResponse.json(updatedOrder);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}