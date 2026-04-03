import * as dotenv from 'dotenv';
import fs from 'fs';

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else dotenv.config();

const tgToken = process.env.TELEGRAM_BOT_TOKEN;
const tgChat  = process.env.TELEGRAM_ADMIN_CHAT_ID;

if (!tgToken) { console.error('❌ TELEGRAM_BOT_TOKEN не задан'); process.exit(1); }
if (!tgChat)  { console.error('❌ TELEGRAM_ADMIN_CHAT_ID не задан'); process.exit(1); }

console.log(`✅ TELEGRAM_BOT_TOKEN: ${tgToken.slice(0, 10)}...`);
console.log(`✅ TELEGRAM_ADMIN_CHAT_ID: ${tgChat}`);
console.log(`📤 Отправляем тестовое сообщение...`);

const msg = [
  `⚠️ *Расхождение цены доставки*`,
  ``,
  `📦 *Заказ:* #TEST-001`,
  `💰 *Цена в CRM:* 500 ₽`,
  `✅ *Фактическая цена доставки:* 900 ₽`,
].join("\n");

const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: "Markdown" }),
});

const data = await res.json();

if (data.ok) {
  console.log(`\n✅ Сообщение отправлено! message_id: ${data.result.message_id}`);
} else {
  console.error(`\n❌ Ошибка:`, JSON.stringify(data, null, 2));
}