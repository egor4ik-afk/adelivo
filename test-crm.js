require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

(async () => {
  try {
    const res = await axios.get("https://kaktusfiori.retailcrm.ru/api/v5/orders", {
      params: { 
        apiKey: process.env.RETAILCRM_API_KEY || 'JQLXCkIYDfGlU1ZeOTJArjo5HnbkoeP7', 
        limit: 20 
      }
    });

    const orders = res.data.orders;
    console.log("=== ДАННЫЕ О ЗАКАЗАХ ===");
    orders.forEach(o => {
      console.log(`\nЗаказ: ${o.number}`);
      console.log("Служба доставки:", o.delivery?.service?.name);
      console.dir(o.delivery, { depth: null, colors: true });
      console.log("Custom Fields:", o.customFields);
    });

  } catch (err) {
    console.error("❌ Ошибка от CRM:");
    console.error(err.response?.data || err.message);
  }
})();