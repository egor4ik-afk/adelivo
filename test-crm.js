const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

// Вставь сюда ID заказа, в котором ты менял адрес (внутренний ID)
const ORDER_ID = "20172"; 

async function run() {
  if (!CRM_URL || !CRM_KEY) return console.error("❌ Ошибка: Нет ключей API в .env");

  console.log(`📡 Запрашиваем заказ #${ORDER_ID} из CRM...`);
  
  try {
    const response = await fetch(`${CRM_URL}/api/v5/orders/${ORDER_ID}?apiKey=${CRM_KEY}&by=id`);
    const data = await response.json();
    
    if (data.success && data.order) {
      console.log("\n=== Блок доставки (Адрес) из CRM ===");
      
      const delivery = data.order.delivery;
      if (delivery && delivery.address) {
        console.log(JSON.stringify(delivery.address, null, 2));
        console.log(`\n✅ Итоговая строка адреса: "${delivery.address.text}"`);
      } else {
        console.log("❌ В этом заказе нет сохраненного адреса доставки.");
      }
      
    } else {
      console.log("❌ Ответ CRM:", data.errorMsg || "Заказ не найден (404)");
    }
  } catch (error) {
    console.error("❌ Сетевая ошибка:", error);
  }
}

run();