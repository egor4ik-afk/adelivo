// src/lib/notifications.ts
import webpush from "web-push";
import { prisma } from "./prisma";
import { sendNewOrderAlert, sendOrderUpdateAlert, sendInvalidAddressAlert } from "./mailer";

export type NotificationEvent =
  | { type: "order.new"; order: OrderPayload }
  | { type: "order.updated"; order: OrderPayload; previousStatus?: string; changes?: any }
  | { type: "address.invalid"; orders: InvalidOrderPayload[] }
  | { type: "route.assigned"; userId: string; routeId: string; pointsCount: number }
  | { type: "route.accepted"; routeName: string; courierName: string; baseTime: string }
  | { type: "custom"; userId: string; title: string; body: string; url?: string }
  | { type: "chat.private"; senderName: string; text: string; targetUserId: string; conversationId: string }
  | { type: "chat.global"; senderName: string; text: string; senderId: string }
  | { type: "konsol.paid"; courierEmail: string; date: string; amount?: number }
  | { type: "manager.notification"; notification: any }; // 🔥 ДОБАВЛЕНО
  
interface OrderPayload {
  id: string;
  crmId: string;
  externalId: string | null;
  shop?: string | null;
  courierId?: number | null;
  address: string | null;
  slotRaw: string | null;
  courier: string | null;
  items: string | null;
  status: string;
  comment?: string | null;
  opComment?: string | null;
  recipientPhone?: string | null;
}

interface InvalidOrderPayload {
  externalId: string | null;
  address: string | null;
  reason: string;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый",
  ASSIGNED: "Назначен",
  IN_DELIVERY: "В пути",
  DELIVERED: "Доставлен",
  RETURNED: "Возврат",
  CANCELLED: "Отменён",
};

function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s;
}

function getShopPrefix(shop?: string | null) {
  if (shop === 'kaktusfiori' || shop === 'meura-flowers') return "🌸 Meura";
  if (shop === 'bunch') return "📦 Bunch";
  return "📦"; 
}

function initWebPush(): boolean {
  const mailto = process.env.VAPID_MAILTO;
  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privKey = process.env.VAPID_PRIVATE_KEY;

  if (!mailto || !pubKey || !privKey) {
    console.warn("[Push] VAPID keys not set");
    return false;
  }

  const subject = mailto.startsWith("mailto:") ? mailto : `mailto:${mailto}`;

  try {
    webpush.setVapidDetails(subject, pubKey, privKey);
    return true;
  } catch (e) {
    console.error("[Push] setVapidDetails error:", e);
    return false;
  }
}

async function log(type: string, channel: string, payload: object, success: boolean, error?: string) {
  await prisma.notificationLog
    .create({ data: { type, channel, payload: JSON.stringify(payload), success, error } })
    .catch(() => {});
}

async function sendIndividualPushes(event: NotificationEvent) {
  if (!initWebPush()) return;

  if (event.type === "custom") {
    const user = await prisma.user.findUnique({
      where: { id: event.userId },
      include: { pushSubscriptions: true },
    });
    
    if (!user || !user.pushSubscriptions.length) return;

    const payload = JSON.stringify({
      title: event.title,
      body: event.body,
      url: event.url || "/",
      role: user.role,
      timestamp: Date.now(),
    });

    const expiredEndpoints: string[] = [];
    for (const sub of user.pushSubscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) expiredEndpoints.push(sub.endpoint);
      }
    }
    if (expiredEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: expiredEndpoints } } });
    }
    return;
  }

  if (event.type === "chat.private") {
    const targetUser = await prisma.user.findUnique({
      where: { id: event.targetUserId },
      include: { pushSubscriptions: true },
    });
    
    if (!targetUser || !targetUser.pushSubscriptions.length) return;
 
    const payload = JSON.stringify({
      title: `💬 ${event.senderName}`,
      body: event.text,
      url: targetUser.role === "COURIER" ? "/courier/routes" : "/dashboard",
      role: targetUser.role,
      orderId: null,
      tag: `chat-conv-${event.conversationId}`,
      timestamp: Date.now(),
    });
 
    const expiredEndpoints: string[] = [];
    for (const sub of targetUser.pushSubscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) expiredEndpoints.push(sub.endpoint);
        else console.error(`[Push] chat.private error:`, e.statusCode, e.body);
      }
    }
    if (expiredEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: expiredEndpoints } } });
    }
    return;
  }

  const users = await prisma.user.findMany({ include: { pushSubscriptions: true } });
  const expiredEndpoints: string[] = [];

  for (const user of users) {
    if (!user.pushSubscriptions.length) continue;

    let shouldSend = false;
    let title = "";
    const bodyTexts: string[] = [];
    let targetUrl: string | null = null;
    const role = user.role;

    // ── АДМИНЫ (бывшие Операторы) и МЕНЕДЖЕРЫ (текущие OPERATOR) ──
    if (user.role === "ADMIN" || user.role === "OPERATOR") {
      // Базовый урл: Админов кидаем в дашборд, Менеджеров — в их кабинет
      targetUrl = user.role === "OPERATOR" ? "/manager" : "/dashboard";

      if (event.type === "manager.notification") {
        if ((user as any).notifyLogistChanges ?? true) { 
          shouldSend = true;
          const pushTitles: Record<string, string> = {
            TIME_CHANGED: "⏱ Изменено время выезда",
            ORDERS_CHANGED: "📦 Изменены заказы в маршруте",
            ROUTE_REASSIGNED: "🗺️ Назначен новый маршрут",
            COURIER_CHANGED: "👤 Смена курьера",
            OP_COMMENT_ADDED: "💬 Комментарий оператора",
          };
          title = pushTitles[event.notification.changeType] || "🔔 Изменение на базе";
          bodyTexts.push(`Курьер: ${event.notification.courierName}`);
          
          // 🔥 Выводим универсальные значения
          if (event.notification.oldValue) {
             bodyTexts.push(`Было: ${event.notification.oldValue}`);
          }
          bodyTexts.push(`Стало: ${event.notification.newValue}`);

          if (event.notification.authorName) {
             bodyTexts.push(`Автор: ${event.notification.authorName}`);
          }
          targetUrl = "/manager?tab=new";
        }
      }

      if (event.type === "order.new") {
        if (user.notifyNewOrder) {
          shouldSend = true;
          title = `${getShopPrefix(event.order.shop)}: Новый заказ ${event.order.externalId ?? event.order.crmId}`;
          bodyTexts.push(event.order.address ?? "Без адреса");
          // Админа кидаем на конкретный заказ, Менеджера просто в кабинет
          targetUrl = user.role === "OPERATOR" ? "/manager" : `/dashboard?orderId=${event.order.id}`;
        }
      } else if (event.type === "order.updated" && event.changes) {
        if (user.notifyStatus && event.changes.statusChanged) {
          const oldLabel = event.previousStatus ? statusLabel(event.previousStatus) : "—";
          const newLabel = statusLabel(event.order.status);
          if (oldLabel !== newLabel) {
            shouldSend = true;
            bodyTexts.push(`Статус: ${oldLabel} ➔ ${newLabel}`);
          }
        }
        if (user.notifyCourier && event.changes.courierChanged) {
          shouldSend = true;
          bodyTexts.push(`Курьер: ${event.order.courier || "Снят"}`);
        }
        if (user.notifyAddress && event.changes.addressChanged) {
          shouldSend = true;
          bodyTexts.push(`Адрес: ${event.order.address || "Удалён"}`);
        }
        if (user.notifyTime && event.changes.slotChanged) {
          shouldSend = true;
          bodyTexts.push(`Время: ${event.order.slotRaw || "—"}`);
        }
        if (user.notifyComment && event.changes.commentChanged && event.order.comment?.trim()) {
          shouldSend = true;
          bodyTexts.push(`Коммент: ${event.order.comment.trim()}`);
        }
        if (user.notifyOpComment && event.changes.opCommentChanged && event.order.opComment?.trim()) {
          // 🔥 ИСКЛЮЧАЕМ ДУБЛЬ: Если у менеджера включено Табло, стандартный пуш не шлем
          const isManagerWithPlaque = user.role === "OPERATOR" && (user as any).notifyLogistChanges;
          if (!isManagerWithPlaque) {
            shouldSend = true;
            bodyTexts.push(`Коммент оператора: ${event.order.opComment.trim()}`);
          }
        }
        if (user.notifyItems && event.changes.itemsChanged) {
          shouldSend = true;
          bodyTexts.push(`Состав изменён`);
        }
        if (event.changes.recipientPhoneChanged) {
          shouldSend = true;
          bodyTexts.push(`Телефон получателя изменен`);
        }
        
        if (shouldSend) {
          title = `${getShopPrefix(event.order.shop)}: Изменения в ${event.order.externalId ?? event.order.crmId}`;
          // Формируем правильную ссылку в зависимости от роли
          targetUrl = user.role === "OPERATOR" ? "/manager" : `/dashboard?orderId=${event.order.id}`;
        }
      } else if (event.type === "address.invalid") {
        // 🔥 Менеджерам ошибки геокодинга не нужны, отправляем только Админам
        if (user.role === "ADMIN") { 
          shouldSend = true;
          title = `⚠️ Ошибка геокодинга`;
          bodyTexts.push(`Адресов не найдено: ${event.orders.length}`);
          targetUrl = "/dashboard";
        }
      }
    }

    // ── КУРЬЕРЫ ──
    if (user.role === "COURIER") {
      targetUrl = "/courier/routes";

      if (event.type === "konsol.paid" && user.email === event.courierEmail) {
        shouldSend = true;
        title = `💰 Оплата отправлена!`;
        if (event.amount) bodyTexts.push(`Сумма: ${event.amount} ₽`);
        bodyTexts.push(`Выплата за смену ${event.date} успешно проведена.`);
        bodyTexts.push(`📝 Зайдите в приложение Консоль.Про и подпишите акт!`);
      }
      
      if (event.type === "route.assigned" && event.userId === user.id) {
        shouldSend = true;
        title = `🗺 Назначен маршрут: ${event.routeId}`;
        bodyTexts.push(`📍 Точек в маршруте: ${event.pointsCount}`);
        bodyTexts.push(`👉 Откройте раздел "Маршруты"`);
      }

      if (event.type === "order.updated" && event.changes) {
        const courierRecord = await prisma.courier.findFirst({
          where: { email: user.email ?? undefined },
        });
        const eventCourierId = (event.order as any).courierId;

        if (courierRecord && eventCourierId === courierRecord.id) {
          // 🔥 ИСПРАВЛЕНО: Блокируем спам при первичном назначении (NEW -> ASSIGNED)
          if (event.changes.statusChanged) {
            const oldLabel = event.previousStatus ? statusLabel(event.previousStatus) : "—";
            const newLabel = statusLabel(event.order.status);
            
            if (oldLabel !== newLabel && !(event.previousStatus === "NEW" && event.order.status === "ASSIGNED")) {
              shouldSend = true;
              bodyTexts.push(`Статус: ${oldLabel} ➔ ${newLabel}`);
            }
          }
          if (event.changes.addressChanged) {
            shouldSend = true;
            bodyTexts.push(`Новый адрес: ${event.order.address ?? "—"}`);
          }
          if (event.changes.slotChanged) {
            shouldSend = true;
            bodyTexts.push(`Новое время: ${event.order.slotRaw ?? "—"}`);
          }
          // 🔥 ИСПРАВЛЕНО: Проверка на пустой комментарий
          if (event.changes.commentChanged && event.order.comment?.trim()) {
            shouldSend = true;
            bodyTexts.push(`Коммент клиента: ${event.order.comment.trim()}`);
          }
          if (event.changes.opCommentChanged && event.order.opComment?.trim()) {
            shouldSend = true;
            bodyTexts.push(`Коммент оператора: ${event.order.opComment.trim()}`);
          }
          if (event.changes.itemsChanged) {
            shouldSend = true;
            bodyTexts.push(`Состав заказа изменён`);
          }
          if (event.changes.recipientPhoneChanged) {
            shouldSend = true;
            bodyTexts.push(`Новый телефон получателя: ${event.order.recipientPhone ?? "Удален"}`);
          }

          if (shouldSend) {
            title = `⚠️ Изменения: заказ ${event.order.externalId ?? event.order.crmId}`;
          }
        }
      }
    }

    if (event.type === "chat.global" && user.id !== event.senderId) {
      shouldSend = true;
      title = `💬 Общий чат: ${event.senderName}`;
      bodyTexts.push(event.text);
      targetUrl = user.role === "COURIER" ? "/courier/routes" : "/dashboard";
    }

    if (shouldSend && title) {
      const isChat = event.type === "chat.global";
      const payload = JSON.stringify({
        title,
        body: bodyTexts.join("\n") || " ",
        url: targetUrl,       
        role,                 
        orderId: event.type !== "address.invalid" && event.type !== "route.assigned" && !isChat
          ? (event as any).order?.id ?? null
          : null,
        tag: isChat
          ? `chat-global-${event.senderId}`
          : (event as any).order?.id
            ? `order-${(event as any).order.id}`
            : "eventwave",
        timestamp: Date.now(),
      });

      for (const sub of user.pushSubscriptions) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        } catch (e: any) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          } else {
            console.error(`[Push] sendNotification error for ${sub.endpoint}:`, e.statusCode, e.body);
          }
        }
      }
    }
  }

  if (expiredEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: expiredEndpoints } },
    });
    console.log(`[Push] Removed ${expiredEndpoints.length} expired subscriptions`);
  }
}

export async function notify(event: NotificationEvent) {
  await sendIndividualPushes(event).catch(console.error);

  switch (event.type) {
    case "order.new": {
      const { order } = event;
      try {
        await sendNewOrderAlert(order as any);
        await log("order.new", "email", order, true);
      } catch (e) {
        await log("order.new", "email", order, false, String(e));
      }
      break;
    }
    case "order.updated": {
      const { order, previousStatus, changes } = event;
      if (changes?.statusChanged && previousStatus && statusLabel(previousStatus) !== statusLabel(order.status)) {
        try {
          await sendOrderUpdateAlert({ ...order, previousStatus } as any);
          await log("order.updated", "email", { order, previousStatus }, true);
        } catch (e) {
          await log("order.updated", "email", { order, previousStatus }, false, String(e));
        }
      }
      break;
    }
    case "address.invalid": {
      const { orders } = event;
      if (orders.length === 0) break;
      try {
        await sendInvalidAddressAlert(orders as any);
        await log("address.invalid", "email", { count: orders.length }, true);
      } catch (e) {
        await log("address.invalid", "email", { count: orders.length }, false, String(e));
      }
      break;
    }
  }
}

export async function createManagerPlaque(data: {
  courierId: string | number;
  courierName?: string | null;
  newValue?: string | null;
  oldValue?: string | null;
  authorName?: string | null;
  changeType: string; 
}) {
  try {
    const safeCourierId = data.courierId ? String(data.courierId) : "UNASSIGNED";
    const safeCourierName = data.courierName || "Без курьера";
    const safeNewValue = data.newValue || "—";
    const safeOldValue = data.oldValue || null;
    const safeChangeType = data.changeType || "DEFAULT";

    const existing = await prisma.managerNotification.findFirst({
      where: { courierId: safeCourierId, isSeen: false }
    });

    let record;
    if (existing) {
      record = await prisma.managerNotification.update({
        where: { id: existing.id },
        data: {
          newValue: safeNewValue,
          oldValue: existing.oldValue || safeOldValue || existing.newValue,
          changeType: safeChangeType,
          authorName: data.authorName || existing.authorName,
          createdAt: new Date()
        }
      });
    } else {
      record = await prisma.managerNotification.create({
        data: {
          courierId: safeCourierId,
          courierName: safeCourierName,
          newValue: safeNewValue,
          oldValue: safeOldValue,
          authorName: data.authorName || null,
          changeType: safeChangeType
        }
      });
    }

    // 2. ЛОГИРУЕМ УСПЕХ
    await prisma.notificationLog.create({
      data: { type: "debug.plaque.success", channel: "system", payload: JSON.stringify(record), success: true }
    });

    notify({ type: "manager.notification", notification: record }).catch(() => {});
    return record;
  } catch (error: any) {
    console.error("❌ [FATAL Plaque Error]:", error);
    // 3. ЛОГИРУЕМ ОШИБКУ (если что-то не так со схемой или типами)
    await prisma.notificationLog.create({
      data: { 
        type: "debug.plaque.error", 
        channel: "system", 
        payload: JSON.stringify(data), 
        success: false, 
        error: String(error?.message || error) 
      }
    }).catch(() => {});
    return null;
  }
}