const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.KONSOL_API_KEY;
const KONSOL_BUS = 'https://api.konsol.pro/bus/alpha';
const headers = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

async function run() {
  // Берём реальный ID из твоих данных
  const taskId = 4776522; // Наибов Тогрул — видели в filter

  const res = await axios.get(`${KONSOL_BUS}/workflow/tasks/${taskId}`, { 
    headers, 
    validateStatus: () => true 
  });
  
  console.log("Статус:", res.status);
  console.log("Ответ:", JSON.stringify(res.data, null, 2));
}

run();