import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

// Шаг 1: сбрасываем на self-delivery
const params1 = new URLSearchParams();
params1.append("apiKey", CRM_KEY);
params1.append("order", JSON.stringify({ delivery: { code: "self-delivery" } }));
params1.append("by", "id");

await axios.post(
  `${CRM_URL}/api/v5/orders/20172/edit`,
  params1.toString(),
  { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
);
console.log("✅ Шаг 1: сброс на self-delivery");

// Шаг 2: возвращаем logisty без курьера
const params2 = new URLSearchParams();
params2.append("apiKey", CRM_KEY);
params2.append("order", JSON.stringify({ 
  delivery: { code: "logisty", typeId: 5 },
  customFields: { courier: null, kurier: null }
}));
params2.append("by", "id");

const res = await axios.post(
  `${CRM_URL}/api/v5/orders/20172/edit`,
  params2.toString(),
  { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
);

const delivery = res.data?.order?.delivery;
console.log("✅ Шаг 2 delivery:", JSON.stringify(delivery, null, 2));