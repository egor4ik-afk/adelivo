// Заглушки для будущих импортов (раскомментируем, когда настроим mailer и web-push)
// import { sendEmail } from "./mailer";
// import webpush from "web-push";
// import prisma from "./prisma";

export type NotificationPayload = {
    title: string;
    body: string;
    url?: string;
  };
  
  /**
   * Отправка универсального уведомления (Push + Email + Лог)
   */
  export async function sendNotification(userId: string, payload: NotificationPayload) {
    console.log(`[Notification] Отправка пользователю ${userId}:`, payload.title);
    
    // TODO: 1. Найти пользователя в БД
    // TODO: 2. Если есть email — отправить письмо (mailer)
    // TODO: 3. Если есть push-подписка — отправить push (web-push)
    // TODO: 4. Записать событие в таблицу NotificationLog в БД
    
    return true;
  }
  
  /**
   * Уведомление об изменении заказа (для операторов/курьеров)
   */
  export async function notifyOrderUpdate(orderId: string, newStatus: string) {
    console.log(`[Notification] Заказ ${orderId} изменил статус на ${newStatus}`);
    
    // TODO: Получить список всех операторов и разослать им уведомления
  }

  export async function notify(event: { type: string; order: any; previousStatus?: string }) {
    console.log(`[Event] ${event.type} для заказа ${event.order?.id}`);
    
    if (event.type === "order.updated" && event.order) {
       await notifyOrderUpdate(event.order.id, event.order.status);
    }
  }