const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

// Вставь ID заказа, в котором УЖЕ УСПЕШНО НАЗНАЧЕН КУРЬЕР через саму RetailCRM
const ORDER_ID = "20161"; 

async function run() {
  console.log(`📡 Получаем данные заказа ${ORDER_ID}...`);
  try {
    const response = await fetch(`${CRM_URL}/api/v5/orders/${ORDER_ID}?apiKey=${CRM_KEY}&by=id`);
    const data = await response.json();
    
    if (data.success) {
      console.log("\n=== Блок доставки из CRM ===");
      console.log(JSON.stringify(data.order.delivery, null, 2));
    } else {
      console.log("Ошибка:", data.errorMsg);
    }
  } catch (error) {
    console.error("❌ Сетевая ошибка:", error);
  }
}

run();