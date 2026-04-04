// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder, updateCrmOrderDeliveryPrice } from "@/lib/crm";
import { notify } from "@/lib/notifications";
import { OrderStatus } from "@prisma/client";

const STORE_COORDS = "55.749511,37.596205";

// 🔥 Хелперы для строгой математики времени (в часовом поясе МСК)
function getCurrentMskMinutes() {
  const mskDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  return mskDate.getHours() * 60 + mskDate.getMinutes();
}

function parseTimeStr(timeStr: string | null | undefined) {
  if (!timeStr || timeStr === "—") return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function formatTimeStr(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440; 
  const h = Math.floor(normalized / 60).toString().padStart(2, '0');
  const m = (normalized % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(req as any);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();

    const order = await prisma.order.findUnique({ 
      where: { id },
      include: { route: true } 
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updateData: any = {};
    let diffMinutesToShift = 0;
    let shouldShift = false;

    if (body.status !== undefined) {
      updateData.status = body.status;
      updateData.changedAt = new Date();
      
      // 🚀 ЛОГИКА "В ПУТИ"
      if (body.status === "IN_DELIVERY") {
        if (order.status !== "IN_DELIVERY" || !order.pickedUpAt) {
          updateData.pickedUpAt = new Date();
        }

        // Если пришло точное расчетное время (из Дашборда или Карты курьера)
        if (body.eta && body.eta !== "—") {
           updateData.eta = body.eta;
           const oldMins = parseTimeStr(order.eta);
           const newMins = parseTimeStr(body.eta);
           
           // Считаем разницу для сдвига остальных точек
           if (oldMins !== null && newMins !== null && order.status !== "IN_DELIVERY") {
              diffMinutesToShift = newMins - oldMins;
              shouldShift = true;
           }
        } 
        // ❌ Мы полностью УДАЛИЛИ попытки сервера самому угадывать ETA при выезде. 
        // Если body.eta нет, мы просто фиксируем выезд (pickedUpAt) и оставляем старый план (eta) в покое.
      }
      
      // ✅ ЛОГИКА "ДОСТАВЛЕН"
      if (body.status === "DELIVERED" && order.status !== "DELIVERED") {
         const currentMins = getCurrentMskMinutes();
         const planMins = parseTimeStr(order.eta);
         
         if (planMins !== null) {
            // ФАКТ закрытия МИНУС ПЛАН = опоздание
            diffMinutesToShift = currentMins - planMins;
            shouldShift = true;
         }
      }

      // ↩️ СБРОС ВРЕМЕНИ
      if (body.status === "NEW") {
        updateData.pickedUpAt = null;
        updateData.eta = null; // Очищаем план ТОЛЬКО если совсем отменили
      } else if (body.status === "ASSIGNED") {
        updateData.pickedUpAt = null;
        // При возврате в "Назначен" мы НЕ трогаем ETA, сохраняем первоначальный план!
      }
    }
    
    // Ручные правки (если статус не IN_DELIVERY)
    if (body.eta !== undefined && body.status !== "IN_DELIVERY") updateData.eta = body.eta;
    if (body.opComment !== undefined) updateData.opComment = body.opComment;
    if (body.address !== undefined) updateData.address = body.address;
    if (body.recipientPhone !== undefined) updateData.recipientPhone = body.recipientPhone;
    if (body.slotRaw !== undefined) updateData.slotRaw = body.slotRaw;
    if (body.comment !== undefined) updateData.comment = body.comment;
    if (body.items !== undefined) updateData.items = body.items;
    if (body.routeId !== undefined) updateData.routeId = body.routeId;
    if (body.routeOrder !== undefined) updateData.routeOrder = body.routeOrder;
    if (body.price !== undefined) updateData.price = body.price;
    if (body.costPrice !== undefined) updateData.costPrice = body.costPrice;

    // Логика курьера и цены
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

    // Свежие координаты
    const freshCoords = await prisma.order.findUnique({ where: { id }, select: { lat: true, lng: true }});
    const finalCourier = updateData.courier !== undefined ? updateData.courier : order.courier;
    if (finalCourier && (body.courier !== undefined || body.address !== undefined)) {
      if (freshCoords?.lat && freshCoords?.lng) {
        updateData.courierLink = `https://yandex.ru/maps/?mode=routes&rtext=${STORE_COORDS}~${freshCoords.lat},${freshCoords.lng}&rtt=auto`;
      }
    }

    const newCourierId = updateData.courierId as number | undefined;
    if (newCourierId && newCourierId !== order.courierId) {
      if (order.routeId) {
        const siblingsCount = await prisma.order.count({ where: { routeId: order.routeId, id: { not: id } }});
        if (siblingsCount === 0) await prisma.route.deleteMany({ where: { id: order.routeId } });
      }

      const orderDate = order.deliveryDate ? order.deliveryDate.toString().split("T")[0] : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
      const prefix = `M-${orderDate.split("-")[2]}`;
      const routes = await prisma.route.findMany({ where: { name: { startsWith: prefix }, date: orderDate }, select: { name: true }});
      
      let maxNum = 0;
      for (const r of routes) {
        const match = r.name.match(new RegExp(`^${prefix}(\\d+)$`));
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }

      const newRoute = await prisma.route.create({
        data: { name: `${prefix}${(maxNum + 1).toString().padStart(3, "0")}`, link: updateData.courierLink, date: orderDate, courierId: newCourierId },
      });

      updateData.routeId = newRoute.id; updateData.routeOrder = 1;
      if (order.status === "NEW") updateData.status = "ASSIGNED";
    }

    if ((body.courier === "" || body.courier === null) && order.courierId !== null) {
      if (order.status === "ASSIGNED" && body.status === undefined) updateData.status = "NEW";
      updateData.pickedUpAt = null;
      if (order.routeId) {
        const siblingsCount = await prisma.order.count({ where: { routeId: order.routeId, id: { not: id } }});
        if (siblingsCount === 0) await prisma.route.deleteMany({ where: { id: order.routeId } });
        updateData.routeId = null; updateData.routeOrder = null;
      }
    }

    if (body.photoUrl !== undefined) updateData.photoUrl = body.photoUrl;

    let updatedOrder = order;
    if (Object.keys(updateData).length > 0) {
      updatedOrder = await prisma.order.update({ where: { id }, data: updateData, include: { route: true } });
    }

    // ⚡️ ВЫЗОВ СДВИГА МАРШРУТА
    // Если есть разница во времени, запускаем сдвиг всех ПОСЛЕДУЮЩИХ точек в фоне
    if (shouldShift && diffMinutesToShift !== 0 && updatedOrder.routeId) {
      shiftFutureRouteEtas(updatedOrder.routeId, updatedOrder.routeOrder, diffMinutesToShift).catch(console.error);
    }

    // Отправка ФОТО в Telegram (уведомления об опоздании удалены, так как теперь есть Cron)
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (tgToken && tgChat) {
      if (body.photoUrl && body.photoUrl !== order.photoUrl) {
        fetch(`https://api.telegram.org/bot${tgToken}/sendPhoto`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            chat_id: tgChat, photo: body.photoUrl,
            caption: `📸 *Фото к заказу ${order.externalId || order.crmId}*\n📍 *Адрес:* ${order.address}`,
            parse_mode: "Markdown" 
          }),
        }).catch(e => console.error("[TG] Ошибка отправки 1 фото:", e));
      }
    }

    if (finalPrice !== undefined && order.crmId) await updateCrmOrderDeliveryPrice(order.crmId, finalPrice);
    let crmStatus = body.status ?? updateData.status;
    if (crmStatus === "ASSIGNED") crmStatus = undefined;
    await updateCrmOrder(order.crmId, { status: crmStatus as OrderStatus | undefined, courier: updateData.courier ?? body.courier, opComment: body.opComment, address: body.address, recipientPhone: body.recipientPhone });

    return NextResponse.json(updatedOrder);
  } catch (e) {
    console.error("PATCH error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// 🔥 Строгая функция сдвига всех ПОСЛЕДУЮЩИХ точек
async function shiftFutureRouteEtas(routeId: string, currentRouteOrder: number | null, diffMinutes: number) {
  if (!currentRouteOrder || diffMinutes === 0) return;
  
  try {
    const futureOrders = await prisma.order.findMany({
      where: { routeId, routeOrder: { gt: currentRouteOrder }, status: { in: ["NEW", "ASSIGNED", "IN_DELIVERY"] } }
    });

    for (const o of futureOrders) {
      const oldMins = parseTimeStr(o.eta);
      if (oldMins === null) continue;
      
      // Сдвигаем строго на вычисленную разницу
      const newEtaStr = formatTimeStr(oldMins + diffMinutes);
      await prisma.order.update({ where: { id: o.id }, data: { eta: newEtaStr } });
    }
    console.log(`[ETA] Сдвинуто ${futureOrders.length} точек на ${diffMinutes} минут.`);
  } catch (err) { console.error(`[ETA] Ошибка при сдвиге маршрута:`, err); }
}