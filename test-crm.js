// test-crm.js
require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

(async () => {
  try {
    const res = await axios.get("https://kaktusfiori.retailcrm.ru/api/v5/orders", {
      params: { 
        apiKey: process.env.RETAILCRM_API_KEY || 'JQLXCkIYDfGlU1ZeOTJArjo5HnbkoeP7', 
        limit: 5 // Берем 5 последних заказов
      }
    });

    const orders = res.data.orders;
    console.log("=== ДАННЫЕ ДОСТАВКИ ИЗ CRM ===");
    orders.forEach(o => {
      console.log(`\nЗаказ: ${o.number}`);
      // Выводим весь объект доставки, чтобы найти нужное поле
      console.dir(o.delivery, { depth: null, colors: true });
      // Также выводим кастомные поля на всякий случай
      console.log("Custom Fields:", o.customFields);
    });

  } catch (err) {
    console.error(err.message);
  }
})();