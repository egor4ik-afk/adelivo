// src/lib/cron.ts
// Импортируйте этот файл в src/app/layout.tsx:
//   import "@/lib/cron";

import cron from "node-cron";
import { pollCrmOrders } from "./crm";

let initialized = false;

if (!initialized && process.env.NODE_ENV !== "test") {
  initialized = true;

  // Fallback polling каждые 5 минут
  cron.schedule("*/5 * * * *", async () => {
    try {
      await pollCrmOrders();
    } catch (err) {
      console.error("[Cron] Poll failed:", err);
    }
  });

  console.log("[Cron] Scheduler started — polling every 5 min");
}
