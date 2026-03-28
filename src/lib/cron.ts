// src/lib/cron.ts
import cron from "node-cron";
import { pollCrmOrders } from "./crm";

let initialized = false;

if (!initialized && process.env.NODE_ENV !== "test") {
  initialized = true;

  // 1. Твой текущий крон для RetailCRM (каждые 5 минут)
  cron.schedule("*/5 * * * *", async () => {
    try {
      await pollCrmOrders();
    } catch (err) {
      console.error("[Cron] Poll failed:", err);
    }
  });

  // Ежедневный крон Консоли (каждый день в 18:00)
  cron.schedule("0 18 * * *", async () => {
    try {
      console.log("[Cron] Запуск ежедневной проверки черновиков (18:00)...");
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
      
      const res = await fetch(`${baseUrl}/api/cron/konsol/daily`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
      });
      
      const data = await res.json();
      console.log("[Cron] Результат ежедневной проверки:", data);
    } catch (err) {
      console.error("[Cron] Daily Konsol failed:", err);
    }
  });

  // 3. Еженедельная финализация Консоли (каждый понедельник в 03:00)
  // ВРЕМЕННО ЗАКОММЕНТИРОВАНО ПО ТВОЕЙ ПРОСЬБЕ
  /*
  cron.schedule("0 3 * * 1", async () => {
    try {
      console.log("[Cron] Запуск еженедельной финализации Консоли...");
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
      
      const res = await fetch(`${baseUrl}/api/cron/konsol/weekly`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
      });
      
      const data = await res.json();
      console.log("[Cron] Результат финализации:", data);
    } catch (err) {
      console.error("[Cron] Weekly Konsol finalize failed:", err);
    }
  });
  */

  console.log("[Cron] Scheduler started — CRM polling active. Konsol finalization is disabled.");
}