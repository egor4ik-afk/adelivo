// scripts/check-order.ts
import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

async function main() {
  const res = await axios.get(`${CRM_URL}/api/v5/orders/20508`, {
    params: { apiKey: CRM_KEY, by: "id" },
  });
  const order = res.data?.order;
  console.log("delivery.time raw:", JSON.stringify(order?.delivery?.time, null, 2));
  console.log("slotFrom/To после parse:", JSON.stringify(
    // повторяем логику parseSlot
    order?.delivery?.time
  ));
}

main().catch(console.error);