// src/lib/notifications.ts
import webpush from "web-push";
import { prisma } from "./prisma";
import { sendNewOrderAlert, sendOrderUpdateAlert, sendInvalidAddressAlert } from "./mailer";

// стало — вызывается только в runtime
function initWebPush() {
  const mailto = process.env.VAPID_MAILTO ?? "mailto:admin@example.com";
  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const privKey = process.env.VAPID_PRIVATE_KEY ?? "";
  if (!pubKey || !privKey) return false;
  webpush.setVapidDetails(mailto, pubKey, privKey);
  return true;
}

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

async function pushToAllOperators(title: string, body: string, data?: object) {
  if (!initWebPush()) {
    console.warn("[Push] VAPID keys not set, skipping push");
    return;
  }

  const subs = await prisma.pushSubscription.findMany({
    include: { user: { select: { role: true } } },
  });

  const operatorSubs = subs.filter((s) => s.user.role === "OPERATOR");
  const payload = JSON.stringify({ title, body, data, timestamp: Date.now() });

  const results = await Promise.allSettled(
    operatorSubs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // Удаляем протухшие подписки (410 Gone)
  const expired: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected" && (result.reason as { statusCode?: number })?.statusCode === 410) {
      expired.push(operatorSubs[i].endpoint);
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
      try { await sendNewOrderAlert(order); await log("order.new", "email", order, true); }
      catch (e) { await log("order.new", "email", order, false, String(e)); }
      try { await pushToAllOperators(`Новый заказ ${order.externalId ?? "—"}`, `${order.slotRaw ?? ""} · ${order.address ?? "—"}`, { orderId: order.id, type: "order.new" }); await log("order.new", "push", order, true); }
      catch (e) { await log("order.new", "push", order, false, String(e)); }
      break;
    }
    case "order.updated": {
      const { order, previousStatus } = event;
      if (previousStatus && previousStatus !== order.status) {
        try { await sendOrderUpdateAlert({ ...order, previousStatus }); await log("order.updated", "email", { order, previousStatus }, true); }
        catch (e) { await log("order.updated", "email", { order, previousStatus }, false, String(e)); }
      }
      try { await pushToAllOperators(`Заказ ${order.externalId ?? "—"} обновлён`, `${previousStatus ?? ""} → ${order.status}`, { orderId: order.id, type: "order.updated" }); await log("order.updated", "push", { order, previousStatus }, true); }
      catch (e) { await log("order.updated", "push", { order, previousStatus }, false, String(e)); }
      break;
    }
    case "address.invalid": {
      const { orders } = event;
      if (orders.length === 0) break;
      try { await sendInvalidAddressAlert(orders); await log("address.invalid", "email", { count: orders.length }, true); }
      catch (e) { await log("address.invalid", "email", { count: orders.length }, false, String(e)); }
      try { await pushToAllOperators(`⚠ ${orders.length} проблемных адреса`, orders.map((o) => o.externalId ?? "—").join(", "), { type: "address.invalid", count: orders.length }); await log("address.invalid", "push", { count: orders.length }, true); }
      catch (e) { await log("address.invalid", "push", { count: orders.length }, false, String(e)); }
      break;
    }
  }
}