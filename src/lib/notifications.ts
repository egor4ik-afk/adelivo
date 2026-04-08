// src/lib/notifications.ts
import webpush from "web-push";
import { prisma } from "./prisma";
import { sendNewOrderAlert, sendOrderUpdateAlert, sendInvalidAddressAlert } from "./mailer";

export type NotificationEvent =
  | { type: "order.new"; order: OrderPayload }
  | { type: "order.updated"; order: OrderPayload; previousStatus?: string; changes?: any }
  | { type: "address.invalid"; orders: InvalidOrderPayload[] }
  | { type: "route.assigned"; userId: string; routeId: string; pointsCount: number }
  | { type: "custom"; userId: string; title: string; body: string; url?: string }
  | { type: "chat.private"; senderName: string; text: string; targetUserId: string; conversationId: string }
  | { type: "chat.global"; senderName: string; text: string; senderId: string };

interface OrderPayload {
  id: string;
  crmId: string;
  externalId: string | null;
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
  // 🔥🔥🔥 ОТКЛЮЧЕНИЕ PUSH-УВЕДОМЛЕНИЙ 🔥🔥🔥
  // Чтобы снова включить пуши, удалите строку `return;` ниже.
  console.log(`[Push] Отключено. Событие ${event.type} проигнорировано.`);
  return; 

  /* НИЖЕ ИДЕТ ОРИГИНАЛЬНЫЙ КОД (ОН БОЛЬШЕ НЕ ВЫПОЛНЯЕТСЯ ИЗ-ЗА return) */
  /*
  if (!initWebPush()) return;

  if (event.type === "custom") {
    // ... остальной код отправки ...
  }
  */
}

export async function notify(event: NotificationEvent) {
  // Push-сообщения теперь отключены внутри sendIndividualPushes
  await sendIndividualPushes(event).catch(console.error);

  // Email-уведомления (без изменений)
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