// src/lib/cron.ts
import cron from "node-cron";
import { pollCrmOrders } from "./crm"; // 🔥 ДОБАВИЛИ ИМПОРТ pollMeuraOrders

let initialized = false;

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

  // 1. RetailCRM: Основной магазин Bunch (каждые 5 минут)
  cron.schedule("*/5 * * * *", async () => {
    try { await pollCrmOrders(); } 
    catch (err) { console.error("[Cron] Poll Bunch failed:", err); }
  });

  // 🔥 1.5 RetailCRM: Сеть Meura (каждые 10 минут) 🔥
  // cron.schedule("*/10 * * * *", async () => {
  //   try { 
  //     console.log("[Cron] Запуск поллинга Meura...");
  //     await pollMeuraOrders(); 
  //   } 
  //   catch (err) { console.error("[Cron] Poll Meura failed:", err); }
  // });

  // 2. Ежедневная проверка (15:00 UTC = 18:00 МСК)
  cron.schedule("0 15 * * *", async () => {
    await callInternalCron("/api/cron/konsol/daily", "Ежедневная проверка (18:00 MSK)");
  });

  // Проверка опозданий каждые 15 минут
  cron.schedule("*/15 * * * *", async () => {
    await callInternalCron("/api/cron/check-delays", "Проверка опозданий");
  });

  // 3. Еженедельная ФИНАЛИЗАЦИЯ (Воскресенье 20:00 UTC = 23:00 МСК)
  // cron.schedule("0 20 * * 0", async () => {
  //   await callInternalCron("/api/cron/konsol/weekly", "Воскресная финализация актов (23:00 MSK)");
  // });

  // 4. Еженедельная ОПЛАТА (Вторник 17:00 UTC = 20:00 МСК)
  // ПОКА ЗАКОММЕНТИРОВАНО
  /*
  cron.schedule("0 17 * * 2", async () => {
    await callInternalCron("/api/cron/konsol/pay", "Вторничная оплата актов (20:00 MSK)");
  });
  */

  console.log("[Cron] Scheduler started. All times adjusted for UTC (Moscow - 3h).");
}