// check-invite.mjs
import * as dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.KONSOL_API_KEY;
const KONSOL_V2 = "https://api.konsol.pro/v2";

// ✏️ Данные для теста — замените на реальные
const TEST_PHONE = "+79162685738"; // Татьяна — она точно есть
const TEST_NAME  = "Алиева Татьяна Анатольевна";
const SCENARIO_ID = ""; // ✏️ Нужно вставить ваш scenario_id

async function checkInvites() {
  console.log("1️⃣  Список существующих приглашений");
  const r1 = await fetch(`${KONSOL_V2}/contractor_invites?page=1&per=5`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  console.log(`   Статус: ${r1.status}`);
  console.log(`   Ответ:`, (await r1.text()).slice(0, 500), "\n");
}

async function checkScenarios() {
  console.log("2️⃣  Доступные сценарии (scenario_id)");
  const r2 = await fetch(`${KONSOL_V2}/scenarios`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  console.log(`   Статус: ${r2.status}`);
  console.log(`   Ответ:`, (await r2.text()).slice(0, 500), "\n");
}

async function checkContractor() {
  console.log("3️⃣  Проверяем — Татьяна уже исполнитель?");
  const r3 = await fetch(`${KONSOL_V2}/contractors?phone=${TEST_PHONE}`, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  const data = await r3.json();
  const list = Array.isArray(data) ? data : [];
  if (list.length > 0) {
    console.log(`   ✅ Да, исполнитель найден!`);
    console.log(`   ID: ${list[0].id}`);
    console.log(`   Имя: ${list[0].first_name} ${list[0].last_name}`);
    console.log(`   Статус: ${list[0].suspended ? "❌ Заблокирован" : "✅ Активен"}`);
    console.log(`   Договор: ${list[0].contracts?.[0]?.status ?? "нет"}\n`);
  } else {
    console.log(`   ❌ Не найден — нужно приглашение\n`);
  }
}

async function sendTestInvite() {
  if (!SCENARIO_ID) {
    console.log("4️⃣  Тест приглашения — пропускаем (SCENARIO_ID не указан)");
    console.log("   Заполните SCENARIO_ID из шага 2️⃣ и запустите снова\n");
    return;
  }

  console.log(`4️⃣  Отправляем тестовое приглашение на ${TEST_PHONE}...`);
  const r4 = await fetch(`${KONSOL_V2}/contractor_invites`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: TEST_NAME,
      phone: TEST_PHONE,
      scenario_id: SCENARIO_ID,
      skip_notification: true, // ✅ SMS не отправляем — только тест
    }),
  });
  console.log(`   Статус: ${r4.status}`);
  const result = await r4.json();
  console.log(`   Ответ:`, JSON.stringify(result, null, 2));

  if (r4.status === 201) {
    console.log(`\n   ✅ Приглашение создано!`);
    console.log(`   invite id: ${result.id}`);
    console.log(`   contractor_id: ${result.contractor_id ?? "пока null — ждёт регистрации"}`);
    console.log(`   onboarding_url: ${result.onboarding_url ?? "нет"}`);
  }
}

async function main() {
  if (!API_KEY) { console.error("❌ KONSOL_API_KEY не задан"); process.exit(1); }

  await checkContractor(); // сначала проверяем — вдруг уже есть
  await checkInvites();    // смотрим существующие приглашения
  await checkScenarios();  // узнаём scenario_id
  await sendTestInvite();  // пробуем создать (только если SCENARIO_ID заполнен)
}

main();