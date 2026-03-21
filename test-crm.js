const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

const ORDER_ID = "20171"; // Тот самый заказ, где сейчас висит Камран

async function run() {
  if (!CRM_URL || !CRM_KEY) return console.error("❌ Ошибка: Нет ключей API");

  // Пробуем хак с нулями: в PHP/RetailCRM 0 часто означает "сбросить связь"
  const orderPayload = {
    delivery: {
      code: "logisty",
      data: {
        id: 0,
        courierId: 0,
        courier: 0
      }
    }
  };

  const params = new URLSearchParams();
  params.append("apiKey", CRM_KEY);
  params.append("order", JSON.stringify(orderPayload));
  params.append("by", "id");

  console.log(`📡 Снимаем курьера нулями...`);
  
  try {
    const response = await fetch(`${CRM_URL}/api/v5/orders/${ORDER_ID}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });
    const data = await response.json();
    
    console.log("\n=== Блок доставки после сброса ===");
    // Выводим только блок доставки, чтобы не засорять консоль
    console.log(JSON.stringify(data.order?.delivery, null, 2));
    
  } catch (error) {
    console.error("❌ Сетевая ошибка:", error);
  }
}

run();