const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.KONSOL_API_KEY;
const KONSOL_BUS = 'https://api.konsol.pro/bus/alpha';
const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json'
};

async function run() {
  const today = new Date();
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayStr = monday.toISOString().split("T")[0];
  const sundayStr = sunday.toISOString().split("T")[0];

  console.log(`Неделя: ${mondayStr} — ${sundayStr}\n`);

  const res = await axios.post(`${KONSOL_BUS}/workflow/tasks/filter`, {
    state_code: ["submitted", "confirmed", "auto_confirmed", "checked_in"],
    since_date: mondayStr,
    to_date: sundayStr,
    pagination: { page: 1, limit: 100 }
  }, { headers, validateStatus: () => true });

  console.log("HTTP статус:", res.status);
  console.log(JSON.stringify(res.data, null, 2));
}

run();