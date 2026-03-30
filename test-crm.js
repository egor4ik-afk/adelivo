// check-order-cost.js
const axios = require('axios');
require('dotenv').config();

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;
const ORDER_ID = '20750'; // ID заказа для проверки

async function checkOrder() {
  if (!CRM_URL || !CRM_KEY) {
    console.error("❌ Ошибка: Не настроены переменные окружения RETAILCRM_API_URL или RETAILCRM_API_KEY");
    return;
  }

  console.log(`--- Проверка заказа ${ORDER_ID} в RetailCRM ---`);
  
  try {
    const response = await axios.get(`${CRM_URL}/api/v5/orders/${ORDER_ID}`, {
      params: {
        apiKey: CRM_KEY,
        by: 'id'
      }
    });

    if (response.data && response.data.success) {
      const order = response.data.order;
      const customFields = order.customFields || {};
      
      console.log("✅ Заказ найден!");
      console.log(`Внешний номер: ${order.number}`);
      console.log(`Статус: ${order.status}`);
      console.log("------------------------------------------");
      console.log("Кастомные поля (customFields):");
      console.log(JSON.stringify(customFields, null, 2));
      console.log("------------------------------------------");

      if (customFields.sebestoimost !== undefined) {
        console.log(`💰 ПОЛЕ НАЙДЕНО! Себестоимость: ${customFields.sebestoimost} ₽`);
      } else {
        console.warn("⚠️ Поле 'sebestoimost' не найдено в этом заказе.");
      }
    } else {
      console.error("❌ CRM ответила ошибкой:", response.data);
    }
  } catch (error) {
    console.error("❌ Ошибка при запросе к API:");
    if (error.response) {
      console.error(`Статус: ${error.response.status}`);
      console.error("Данные:", error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

checkOrder();