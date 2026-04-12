// test-crm.js
// Подгружаем переменные окружения (работает и с .env, и с .env.local)
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });

const KONSOL_BUS = "https://api.konsol.pro/bus/alpha";
const API_KEY = process.env.KONSOL_API_KEY;

// Берем ID задания прямо из аргументов командной строки
const TASK_ID = 4975185;

async function checkTask() {
  if (!API_KEY) {
    console.error("❌ Ошибка: KONSOL_API_KEY не найден в .env!");
    return;
  }

  if (!TASK_ID) {
    console.error("❌ Ошибка: Укажи ID задания при запуске скрипта.\n👉 Пример: node test-crm.js 12345678");
    return;
  }

  console.log(`📡 Запрашиваем задание ${TASK_ID}...`);
  
  try {
    const res = await fetch(`${KONSOL_BUS}/workflow/tasks/${TASK_ID}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      }
    });

    const data = await res.json();

    console.log(`\n=== СТАТУС ОТВЕТА: ${res.status} ===\n`);
    
    // Выводим весь объект целиком
    console.dir(data, { depth: null, colors: true });
    
    if (data.state) {
        console.log(`\n📌 ТЕКУЩИЙ СТАТУС: ${data.state.code}`);
    }
    console.log(`📌 ДАТА НАЧАЛА (since_date): ${data.since_date}`);
    console.log(`📌 ДАТА ОКОНЧАНИЯ (upto_date): ${data.upto_date}`);

  } catch (err) {
    console.error("❌ Ошибка выполнения запроса:", err);
  }
}

checkTask();