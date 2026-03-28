// src/lib/notifications.ts
import webpush from "web-push";
import { prisma } from "./prisma";
import { sendNewOrderAlert, sendOrderUpdateAlert, sendInvalidAddressAlert } from "./mailer";

export type NotificationEvent =
  | { type: "order.new"; order: OrderPayload }
  | { type: "order.updated"; order: OrderPayload; previousStatus?: string; changes?: any }
  | { type: "address.invalid"; orders: InvalidOrderPayload[] }
  | { type: "route.assigned"; userId: string; routeId: string; pointsCount: number };

interface OrderPayload {
  id: string;
  crmId: string;
  externalId: string | null;
  courierId?: number | null;   // ← нужно чтобы матчить курьера
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

// ── РАССЫЛКА PUSH ──
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
    let targetUrl: string | null = null;
    const role = user.role; // "COURIER" | "OPERATOR" | "ADMIN"

    // ════════════════════════════════════════════════════════════
    // ── ОПЕРАТОРЫ и АДМИНЫ ──
    // Получают уведомления по всем заказам, настраиваемые по полям
    // ════════════════════════════════════════════════════════════
    if (user.role === "OPERATOR" || user.role === "ADMIN") {
      targetUrl = "/dashboard"; // оператор всегда идёт в дашборд

      if (event.type === "order.new") {
        // Новый заказ — всегда уведомляем (если notifyNewOrder включено)
        if (user.notifyNewOrder) {
          shouldSend = true;
          title = `🌸 Новый заказ: ${event.order.externalId ?? event.order.crmId}`;
          bodyTexts.push(event.order.address ?? "Без адреса");
          targetUrl = `/dashboard?orderId=${event.order.id}`;
        }
      } else if (event.type === "order.updated" && event.changes) {
        // Обновление заказа — по каждому полю своя настройка
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
        if (user.notifyComment && event.changes.commentChanged) {
          shouldSend = true;
          bodyTexts.push(`Коммент: ${event.order.comment || "—"}`);
        }
        if (user.notifyOpComment && event.changes.opCommentChanged) {
          shouldSend = true;
          bodyTexts.push(`Коммент оператора: ${event.order.opComment || "—"}`);
        }
        if (user.notifyItems && event.changes.itemsChanged) {
          shouldSend = true;
          bodyTexts.push(`Состав изменён`);
        }

        if (shouldSend) {
          title = `📦 Заказ ${event.order.externalId ?? event.order.crmId} обновлён`;
          targetUrl = `/dashboard?orderId=${event.order.id}`;
        }
      } else if (event.type === "address.invalid") {
        shouldSend = true;
        title = `⚠️ Ошибка геокодинга`;
        bodyTexts.push(`Адресов не найдено: ${event.orders.length}`);
        targetUrl = "/dashboard";
      }
    }

    // ════════════════════════════════════════════════════════════
    // ── КУРЬЕРЫ ──
    // Получают уведомления ТОЛЬКО по своим заказам, без выбора
    // Клик всегда ведёт в /courier/routes
    // ════════════════════════════════════════════════════════════
    if (user.role === "COURIER") {
      targetUrl = "/courier/routes"; // курьер всегда идёт в маршруты (/dashboard у курьера нет!)

      if (event.type === "route.assigned" && event.userId === user.id) {
        // Назначен новый маршрут
        shouldSend = true;
        title = `🗺 Новый маршрут назначен`;
        bodyTexts.push(`Точек в маршруте: ${event.pointsCount}`);
        bodyTexts.push(`Откройте раздел "Маршруты"`);
      }

      if (event.type === "order.updated" && event.changes) {
        // Изменения в заказе курьера — матчим по courierId из БД
        const courierRecord = await prisma.courier.findFirst({
          where: { email: user.email ?? undefined },
        });
        const eventCourierId = (event.order as any).courierId;

        if (courierRecord && eventCourierId === courierRecord.id) {
          // Это заказ данного курьера — отправляем ВСЕ изменения без фильтров
          if (event.changes.statusChanged) {
            shouldSend = true;
            const oldLabel = event.previousStatus ? statusLabel(event.previousStatus) : "—";
            const newLabel = statusLabel(event.order.status);
            if (oldLabel !== newLabel) {
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
          if (event.changes.commentChanged) {
            shouldSend = true;
            bodyTexts.push(`Коммент: ${event.order.comment ?? "—"}`);
          }
          if (event.changes.courierChanged) {
            // Курьер снят с заказа
            shouldSend = true;
            bodyTexts.push(event.order.courier ? `Курьер изменён` : `Вы сняты с заказа`);
          }

          if (shouldSend) {
            title = `⚠️ Изменения: заказ ${event.order.externalId ?? event.order.crmId}`;
          }
        }
      }
    }

    // ── Отправляем push если есть что отправить ──
    if (shouldSend && title) {
      const payload = JSON.stringify({
        title,
        body: bodyTexts.join("\n") || " ",
        url: targetUrl,       // sw.js использует это для навигации
        role,                 // sw.js использует это чтобы разрулить курьер/оператор
        orderId: event.type !== "address.invalid" && event.type !== "route.assigned"
          ? (event as any).order?.id ?? null
          : null,
        timestamp: Date.now(),
      });

      for (const sub of user.pushSubscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
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

  // Чистим протухшие подписки
  if (expiredEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: expiredEndpoints } },
    });
    console.log(`[Push] Removed ${expiredEndpoints.length} expired subscriptions`);
  }
}

export async function notify(event: NotificationEvent) {
  await sendIndividualPushes(event).catch(console.error);

  // Email-уведомления (без изменений)
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