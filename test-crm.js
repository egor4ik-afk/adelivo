const axios = require('axios');
require('dotenv').config();

// 🔥 Берем правильный ключ, как в твоем src/lib/konsol.ts
const API_KEY = process.env.KONSOL_API_KEY; 
const TASK_ID = 4712586;

// 🔥 Используем правильный BUS-урл
const KONSOL_BUS = 'https://api.konsol.pro/bus/alpha'; 

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

const NEW_DUTIES = [
  // Заменили 89999 на 89135 (рабочий шаблон), цена 636 всё равно применится правильно
  { template_id: 89135, price: 636,  quantity: 26, desc: "26 по 600 (Авто)" },
  { template_id: 89952, price: 1060, quantity: 7,  desc: "7 по 1000" },
  { template_id: 89953, price: 1484, quantity: 1,  desc: "1 по 1400" }
];

async function run() {
  if (!API_KEY) {
    console.error("❌ ОШИБКА: KONSOL_API_KEY не найден в файле .env!");
    return;
  }

  try {
    console.log(`🚀 Начинаем обновление задания ${TASK_ID}...`);

    // 1. Получаем текущее задание
    const taskRes = await axios.get(`${KONSOL_BUS}/workflow/tasks/${TASK_ID}`, { headers });
    // В зависимости от ответа API Консоли, услуги могут лежать просто в duties или внутри data
    const oldDuties = taskRes.data.duties || taskRes.data.data?.duties || [];
    console.log(`🔎 Найдено старых услуг: ${oldDuties.length}`);

    // 2. Добавляем новые услуги
    for (const duty of NEW_DUTIES) {
      console.log(`➕ Добавляю: ${duty.desc}...`);
      await axios.post(`${KONSOL_BUS}/workflow/duties`, {
        task_id: TASK_ID,
        template_id: duty.template_id,
        measure: "Штука",
        price: duty.price,
        quantity: duty.quantity
      }, { headers });
    }

    // 3. Удаляем старые услуги
    for (const old of oldDuties) {
      if (old.id) {
        console.log(`🗑️ Удаляю старую услугу ID ${old.id}...`);
        await axios.delete(`${KONSOL_BUS}/workflow/duties/${old.id}`, { headers });
      }
    }

    console.log(`\n✅ ГОТОВО! Задание ${TASK_ID} успешно обновлено.`);
    console.log(`Итоговая сумма в Консоли должна быть: ${(26*636 + 7*1060 + 1*1484).toLocaleString()} ₽`);

  } catch (error) {
    console.error("❌ ОШИБКА:");
    console.error(error.response ? error.response.data : error.message);
  }
}

run();