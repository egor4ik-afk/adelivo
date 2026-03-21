// scripts/check-address.mjs
// Запуск: node scripts/check-address.mjs 20172

const ORDER_ID = "20172"; 
// scripts/test-sync-order.mjs
// Запуск: node scripts/test-sync-order.mjs 20172
// Симулирует что делает CRON для конкретного заказа

if (!ORDER_ID) {
  console.error("❌ Укажите crmId: node scripts/test-sync-order.mjs 20172");
  process.exit(1);
}

// Загружаем .env
import { readFileSync } from "fs";
for (const f of [".env.production", ".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][^=]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    break;
  } catch { continue; }
}

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

async function run() {
  // 1. Получаем заказ из CRM
  console.log(`\n📡 Получаем заказ #${ORDER_ID} из CRM...`);
  const res = await fetch(`${CRM_URL}/api/v5/orders/${ORDER_ID}?apiKey=${CRM_KEY}&by=id`);
  const data = await res.json();

  if (!data.success) { console.error("❌ CRM:", data.errorMsg); process.exit(1); }

  const crmAddr = data.order.delivery?.address?.text;
  console.log(`✅ CRM адрес: "${crmAddr}"`);
  console.log(`✅ CRM status: ${data.order.status}`);

  // 2. Проверяем что в нашей БД
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const existing = await prisma.order.findUnique({
    where: { crmId: ORDER_ID },
    select: { address: true, geocoded: true, isInvalid: true },
  });

  console.log(`\n📦 БД адрес: "${existing?.address}"`);
  console.log(`📦 geocoded: ${existing?.geocoded}`);

  // 3. Симулируем логику upsertOrder
  const dbAddr  = existing?.address?.trim() || "";
  const newAddr = crmAddr?.trim() || "";

  if (dbAddr !== newAddr) {
    console.log(`\n✏️  Адреса различаются — должны обновить в БД.`);
    console.log(`   Сейчас обновляем напрямую...`);

    await prisma.order.update({
      where: { crmId: ORDER_ID },
      data: {
        address:       newAddr || null,
        geocoded:      false,
        lat:           null,
        lng:           null,
        isInvalid:     false,
        invalidReason: null,
        changedAt:     new Date(),
      },
    });

    console.log(`✅ Обновлено! Новый адрес: "${newAddr}"`);
    console.log(`   geocoded сброшен → геокодер подберёт координаты`);
  } else {
    console.log(`\n✅ Адреса совпадают — обновления не нужно`);
  }

  await prisma.$disconnect();
}

run().catch(console.error);
