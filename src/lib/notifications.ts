// src/lib/notifications.ts
import webpush from "web-push";
import { prisma } from "./prisma";
import { sendNewOrderAlert, sendOrderUpdateAlert, sendInvalidAddressAlert } from "./mailer";

export type NotificationEvent =
  | { type: "order.new"; order: OrderPayload }
  // Добавили поле changes
  | { type: "order.updated"; order: OrderPayload; previousStatus?: string; changes?: any }
  | { type: "address.invalid"; orders: InvalidOrderPayload[] }
  | { type: "route.assigned"; userId: string; routeId: string; pointsCount: number };

interface OrderPayload {
  id: string;
  crmId: string;
  externalId: string | null;
  address: string | null;
  slotRaw: string | null;
  courier: string | null;
  items: string | null;
  status: string;
  comment?: string | null;
  opComment?: string | null;
}

interface InvalidOrderPayload {
  externalId: string | null;
  address: string | null;
  reason: string;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый", 
  GEOCODED: "Новый", 
  INVALID_ADDRESS: "Новый",
  ASSIGNED: "Назначен",
  IN_DELIVERY: "В пути", 
  DELIVERED: "Доставлен",
  RETURNED: "Возврат", 
  CANCELLED: "Отменён",
};

function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s;
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

// ── ИНДИВИДУАЛЬНАЯ РАССЫЛКА PUSH ──
async function sendIndividualPushes(event: NotificationEvent) {
  if (!initWebPush()) return;

  const users = await prisma.user.findMany({
    include: { pushSubscriptions: true },
  });

  const expiredEndpoints: string[] = [];

  for (const user of users) {
    if (!user.pushSubscriptions.length) continue;

    let shouldSend = false;
    let title = "";
    const bodyTexts: string[] = [];

    // ── ЛОГИКА ДЛЯ ОПЕРАТОРОВ / АДМИНОВ ──
    if (user.role === "OPERATOR" || user.role === "ADMIN") {
      if (event.type === "order.new" && user.notifyNewOrder) {
        shouldSend = true; title = `🌸 Новый заказ: ${event.order.externalId ?? "—"}`;
        bodyTexts.push(event.order.address ?? "Без адреса");
      } 
      else if (event.type === "order.updated" && event.changes) {
        shouldSend = true; title = `📦 Заказ ${event.order.externalId ?? "—"} обновлён`;
        if (event.changes.statusChanged && user.notifyStatus) bodyTexts.push(`Статус изменен`);
        // ... (остальные проверки оператора)
      } 
      else if (event.type === "address.invalid") {
        shouldSend = true; title = `⚠️ Ошибка геокодинга`; bodyTexts.push(`Не найдено адресов: ${event.orders.length}`);
      }
    }

    // ── ЛОГИКА ДЛЯ КУРЬЕРОВ (Изолированная) ──
    if (user.role === "COURIER") {
      // 1. Пуш о новом маршруте (строго ему)
      if (event.type === "route.assigned" && event.userId === user.id) {
        shouldSend = true;
        title = `🗺 Новый маршрут ${event.routeId}`;
        bodyTexts.push(`Вам назначено точек: ${event.pointsCount}`);
        bodyTexts.push(`Зайдите в раздел "Маршруты"`);
      }
      
      // 2. Пуш об обновлении заказа (только если заказ висит на нем)
      if (event.type === "order.updated" && event.changes) {
        // Проверяем, привязан ли этот заказ к курьеру через email пользователя
        const courierDb = await prisma.courier.findFirst({ where: { email: user.email } });
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eventOrderCourierId = (event.order as any).courierId; 

        if (courierDb && eventOrderCourierId === courierDb.id) {
          if (event.changes.addressChanged || event.changes.slotChanged || event.changes.commentChanged) {
            shouldSend = true;
            title = `⚠ Изменения в заказе ${event.order.externalId ?? "—"}`;
            if (event.changes.addressChanged) bodyTexts.push(`Новый адрес: ${event.order.address}`);
            if (event.changes.slotChanged) bodyTexts.push(`Новое время: ${event.order.slotRaw}`);
            if (event.changes.commentChanged) bodyTexts.push(`Новый коммент: ${event.order.comment}`);
          }
        }
      }
    }

    if (shouldSend && title) {
      const payload = JSON.stringify({
        title, body: bodyTexts.join("\n"), notifyTabs: true, timestamp: Date.now(),
      });

      for (const sub of user.pushSubscriptions) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        } catch (e: any) {
          if (e.statusCode === 410 || e.statusCode === 404) expiredEndpoints.push(sub.endpoint);
        }
      }
    }
  }

  if (expiredEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: expiredEndpoints } } });
  }
}

export async function notify(event: NotificationEvent) {
  // Отправляем PUSH (индивидуально)
  await sendIndividualPushes(event).catch(console.error);

  // Отправляем Emails и пишем логи (ОДИН раз на событие, как и было)
  switch (event.type) {
    case "order.new": {
      const { order } = event;
      try {
        await sendNewOrderAlert(order);
        await log("order.new", "email", order, true);
      } catch (e) {
        await log("order.new", "email", order, false, String(e));
      }
      break;
    }
    case "order.updated": {
      const { order, previousStatus, changes } = event;
      // Если поменялся публичный статус, шлем письмо
      if (changes?.statusChanged && previousStatus && statusLabel(previousStatus) !== statusLabel(order.status)) {
        try {
          await sendOrderUpdateAlert({ ...order, previousStatus });
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
        await sendInvalidAddressAlert(orders);
        await log("address.invalid", "email", { count: orders.length }, true);
      } catch (e) {
        await log("address.invalid", "email", { count: orders.length }, false, String(e));
      }
      break;
    }
  }
}