// check-crm-fields.js — найти кастомные поля заказов в CRM
// Запустить: node check-crm-fields.js

require('dotenv').config();
const axios = require('axios');

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

async function run() {
  if (!CRM_URL || !CRM_KEY) {
    console.error('Нет CRM_URL или CRM_KEY в .env');
    process.exit(1);
  }

  // 1. Смотрим кастомные поля заказов
  console.log('=== Кастомные поля заказов ===');
  try {
    const res = await axios.get(`${CRM_URL}/api/v5/custom-fields/orders`, {
      params: { apiKey: CRM_KEY }
    });
    const fields = res.data?.customFields ?? {};
    const arr = Array.isArray(fields) ? fields : Object.values(fields);
    if (arr.length === 0) {
      console.log('Кастомных полей нет — нужно создать в CRM');
    } else {
      arr.forEach(f => {
        console.log(`  код: "${f.code}" | название: "${f.name}" | тип: ${f.type}`);
      });
    }
  } catch (e) {
    console.error('Ошибка:', e?.response?.data ?? e.message);
  }

  // 2. Смотрим реальный заказ — что в customFields
  console.log('\n=== CustomFields последнего заказа ===');
  try {
    const res = await axios.get(`${CRM_URL}/api/v5/orders`, {
      params: { apiKey: CRM_KEY, limit: 1, page: 1 }
    });
    const order = res.data?.orders?.[0];
    if (order) {
      console.log(`Заказ #${order.id}:`);
      console.log('customFields:', JSON.stringify(order.customFields, null, 2));
    }
  } catch (e) {
    console.error('Ошибка:', e?.response?.data ?? e.message);
  }
}

run();