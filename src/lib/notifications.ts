// src/lib/notifications.ts
import webpush from "web-push";
import { prisma } from "./prisma";
import { sendNewOrderAlert, sendOrderUpdateAlert, sendInvalidAddressAlert } from "./mailer";

export type NotificationEvent =
  | { type: "order.new"; order: OrderPayload }
  | { type: "order.updated"; order: OrderPayload; previousStatus?: string }
  | { type: "address.invalid"; orders: InvalidOrderPayload[] };

interface OrderPayload {
  id: string;
  crmId: string;
  externalId: string | null;
  address: string | null;
  slotRaw: string | null;
  courier: string | null;
  items: string | null;
  status: string;
}

interface InvalidOrderPayload {
  externalId: string | null;
  address: string | null;
  reason: string;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый", GEOCODED: "Геокодирован", ASSIGNED: "Назначен",
  IN_DELIVERY: "В пути", DELIVERED: "Доставлен",
  RETURNED: "Возврат", CANCELLED: "Отменён", INVALID_ADDRESS: "Проблемный адрес",
};

function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s;
}

function orderBody(order: OrderPayload, extra?: string): string {
  const parts: string[] = [];
  if (order.slotRaw) parts.push(order.slotRaw);
  if (order.address) parts.push(order.address);
  if (order.courier) parts.push(`👤 ${order.courier}`);
  if (extra) parts.push(extra);
  return parts.join(" · ");
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

async function pushToAllOperators(title: string, body: string, data?: object) {
  if (!initWebPush()) return;

  const subs = await prisma.pushSubscription.findMany({
    include: { user: { select: { role: true } } },
  });

  const operatorSubs = subs.filter(s => s.user.role === "OPERATOR" || s.user.role === "ADMIN");

  if (operatorSubs.length === 0) {
    console.warn("[Push] No operator subscriptions found");
    return;
  }

  const payload = JSON.stringify({
    title,
    body,
    data,
    notifyTabs: true,
    timestamp: Date.now(),
  });

  const results = await Promise.allSettled(
    operatorSubs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  const expired: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const code = (result.reason as { statusCode?: number })?.statusCode;
      console.warn(`[Push] Sub ${i} failed: ${code} ${result.reason?.message ?? ""}`);
      if (code === 410) expired.push(operatorSubs[i].endpoint);
    }
  });

  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: expired } } });
  }
}

async function log(type: string, channel: string, payload: object, success: boolean, error?: string) {
  await prisma.notificationLog
    .create({ data: { type, channel, payload: JSON.stringify(payload), success, error } })
    .catch(() => {});
}

export async function notify(event: NotificationEvent) {
  switch (event.type) {
    case "order.new": {
      const { order } = event;
      try {
        await sendNewOrderAlert(order);
        await log("order.new", "email", order, true);
      } catch (e) {
        await log("order.new", "email", order, false, String(e));
      }
      try {
        await pushToAllOperators(
          `🌸 Новый заказ ${order.externalId ?? "—"}`,
          orderBody(order),
          { orderId: order.id, type: "order.new" }
        );
        await log("order.new", "push", order, true);
      } catch (e) {
        await log("order.new", "push", order, false, String(e));
      }
      break;
    }

    case "order.updated": {
      const { order, previousStatus } = event;
      if (previousStatus && previousStatus !== order.status) {
        try {
          await sendOrderUpdateAlert({ ...order, previousStatus });
          await log("order.updated", "email", { order, previousStatus }, true);
        } catch (e) {
          await log("order.updated", "email", { order, previousStatus }, false, String(e));
        }
      }
      try {
        const statusChange = previousStatus
          ? `${statusLabel(previousStatus)} → ${statusLabel(order.status)}`
          : statusLabel(order.status);
        await pushToAllOperators(
          `📦 Заказ ${order.externalId ?? "—"} обновлён`,
          `${statusChange} · ${orderBody(order)}`,
          { orderId: order.id, type: "order.updated" }
        );
        await log("order.updated", "push", { order, previousStatus }, true);
      } catch (e) {
        await log("order.updated", "push", { order, previousStatus }, false, String(e));
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
      for (const o of orders) {
        try {
          await pushToAllOperators(
            `⚠️ Проблемный адрес: ${o.externalId ?? "—"}`,
            `${o.address ?? "—"} — ${o.reason}`,
            { type: "address.invalid", orderId: null }
          );
        } catch (e) {
          await log("address.invalid", "push", o, false, String(e));
        }
      }
      await log("address.invalid", "push", { count: orders.length }, true);
      break;
    }
  }
}