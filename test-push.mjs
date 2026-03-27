// // test-webhook.js
// // 🔥 Вставь сюда свой НОВЫЙ ДОМЕН (например, https://flowers.vm.relaxdev.ru)
// const DOMAIN = "https://event-wave.ru"; 

// // ID заказа из CRM, который реально там существует (возьмем из прошлых логов)
// const TEST_ORDER_ID = "20172"; 

// async function testWebhook() {
//   console.log(`Отправляем тестовый вебхук на ${DOMAIN}...`);

//   // RetailCRM шлет данные вебхука в формате x-www-form-urlencoded
//   const formData = new URLSearchParams();
//   formData.append("orderId", TEST_ORDER_ID);

//   try {
//     const res = await fetch(`${DOMAIN}/api/webhooks/retailcrm`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//       body: formData.toString(),
//     });

//     const data = await res.json();
//     console.log("\n=== ОТВЕТ ОТ ТВОЕГО СЕРВЕРА ===");
//     console.log(JSON.stringify(data, null, 2));

//     if (data.ok) {
//       console.log(`\n✅ УРА! Сервер принял вебхук и обновил заказ #${TEST_ORDER_ID}!`);
//     } else {
//       console.log(`\n❌ Ошибка. Сервер ответил: ${data.reason || data.error}`);
//     }

//   } catch (error) {
//     console.error("Ошибка при отправке запроса:", error);
//   }
// }

// testWebhook();