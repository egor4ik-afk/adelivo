const axios = require('axios');

const CRM_URL = "https://kaktusfiori.retailcrm.ru";
const CRM_KEY = "JQLXCkIYDfGlU1ZeOTJArjo5HnbkoeP7"; 
// Пиши просто цифры, без решетки #
const ORDER_NUMBER = "29080"; 

async function checkFields() {
  const searchTypes = ["id", "number", "externalId"];
  
  for (const byType of searchTypes) {
    try {
      const params = new URLSearchParams({
        apiKey: CRM_KEY,
        by: byType
      });

      const url = `${CRM_URL}/api/v5/orders/${encodeURIComponent(ORDER_NUMBER)}?${params.toString()}`;
      console.log(`Пробуем найти по ${byType}...`);

      const res = await axios.get(url);
      const order = res.data?.order;

      if (order) {
        console.log("\n✅ ЗАКАЗ НАЙДЕН!\n");
        console.log("=== ДАННЫЕ ЗАКАЗЧИКА (Корень заказа) ===");
        console.log("Имя:", order.firstName);
        console.log("Фамилия:", order.lastName);
        console.log("Телефон:", order.phone);
        console.log("Комментарий заказчика:", order.customerComment);

        console.log("\n=== ПРОФИЛЬ КЛИЕНТА ===");
        console.log("Customer:", order.customer ? "Есть" : "Нет", order.customer?.firstName, order.customer?.phones);

        console.log("\n=== ДАННЫЕ ПОЛУЧАТЕЛЯ И ДОСТАВКИ ===");
        console.log("Адрес:", order.delivery?.address?.text);
        
        console.log("\n=== КАСТОМНЫЕ ПОЛЯ ===");
        console.log(JSON.stringify(order.customFields, null, 2));
        return; // Успешно нашли, выходим
      }
    } catch (error) {
      // Молча переходим к следующему варианту поиска
    }
  }
  
  console.log("\n❌ Заказ не найден ни по id, ни по number, ни по externalId.");
}

checkFields();