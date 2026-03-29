// src/lib/cron.ts
import cron from "node-cron";
import { pollCrmOrders } from "./crm";

let initialized = false;

// Помощник для вызова внутренних API с секретным токеном
async function callInternalCron(path: string, taskName: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
    console.log(`[Cron] Запуск задачи: ${taskName}...`);
    
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
    });
    
    const data = await res.json();
    console.log(`[Cron] ${taskName} завершена:`, data);
  } catch (err) {
    console.error(`[Cron] Ошибка в задаче ${taskName}:`, err);
  }
}

if (!initialized && process.env.NODE_ENV !== "test") {
  initialized = true;

  // 1. RetailCRM (каждые 5 минут)
  cron.schedule("*/5 * * * *", async () => {
    try {
      await pollCrmOrders();
    } catch (err) {
      console.error("[Cron] Poll failed:", err);
    }
  });

  // 2. Ежедневная проверка (каждый день в 18:00)
  // Создает DRAFT задания для тех, кто вышел на смену
  cron.schedule("0 18 * * *", async () => {
    await callInternalCron("/api/cron/konsol/daily", "Ежедневная проверка (18:00)");
  });

  // 3. Еженедельная ФИНАЛИЗАЦИЯ (Воскресенье в 23:00)
  // Собирает все заказы за неделю, обновляет услуги и создает Акт (CONFIRMED)
  cron.schedule("0 23 * * 0", async () => {
    await callInternalCron("/api/cron/konsol/weekly", "Воскресная финализация актов (23:00)");
  });

  // 4. Еженедельная ОПЛАТА (Вторник в 20:00)
  // Подписывает созданные акты и отправляет деньги курьерам
  // ПОКА ОСТАВЛЯЕМ ЗАКОММЕНТИРОВАННЫМ ДЛЯ БЕЗОПАСНОСТИ, КАК ТЫ ПРОСИЛ
  /*
  cron.schedule("0 20 * * 2", async () => {
    await callInternalCron("/api/cron/konsol/pay", "Вторничная оплата актов (20:00)");
  });
  */

  console.log("[Cron] Scheduler started on VM. Sunday Finalization (23:00) & Tuesday Payment (20:00) configured.");
}