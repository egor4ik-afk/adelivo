// sync-couriers.js
// Оставляет только активных курьеров из CRM
// Неактивных — деактивирует, у кого нет заказов — удаляет
// Запуск: node sync-couriers.js

require('dotenv').config();
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

const BAD_WORDS = ["сдэк", "яндекс", "доставк", "курьер", "тест", "пеший", "авто", "logisty", "dostavista"];

async function run() {
  if (!CRM_URL || !CRM_KEY) {
    console.error('❌ Нет CRM_URL или CRM_KEY в .env');
    process.exit(1);
  }

  // 1. Получаем всех курьеров из CRM
  console.log('📥 Загружаем курьеров из CRM...');
  const res = await axios.get(`${CRM_URL}/api/v5/reference/couriers`, {
    params: { apiKey: CRM_KEY },
  });

  const couriersObj = res.data?.couriers || {};
  const crmCouriers = Array.isArray(couriersObj) ? couriersObj : Object.values(couriersObj);
  console.log(`   CRM: ${crmCouriers.length} курьеров всего`);

  // Активные из CRM (фильтруем мусор)
  const activeCrmIds = new Set();
  for (const c of crmCouriers) {
    if (c.active === false) continue;
    const nameParts = [c.firstName, c.patronymic, c.lastName].filter(Boolean);
    const fullName = nameParts.join(' ');
    if (!fullName || fullName.trim().length < 3) continue;
    const lower = fullName.toLowerCase();
    if (BAD_WORDS.some(w => lower.includes(w))) continue;
    activeCrmIds.add(c.id);
  }
  console.log(`   Активных (не мусор): ${activeCrmIds.size}`);

  // 2. Получаем всех курьеров из нашей БД
  const dbCouriers = await prisma.courier.findMany({
    select: { id: true, fullName: true, isActive: true, email: true, konsolContractorId: true }
  });
  console.log(`\n📋 В базе: ${dbCouriers.length} курьеров`);

  let updated = 0, deleted = 0, skipped = 0;

  for (const c of dbCouriers) {
    // Курьер зарегистрировался через приложение (есть email) — не трогаем даже если нет в CRM
    // Но если он неактивен в CRM — деактивируем
    const inCrm = activeCrmIds.has(c.id);

    if (inCrm) {
      // Активен в CRM — если был неактивен у нас, включаем обратно
      if (!c.isActive) {
        await prisma.courier.update({ where: { id: c.id }, data: { isActive: true } });
        console.log(`  ✅ Активировали: ${c.fullName} (ID ${c.id})`);
        updated++;
      }
      continue;
    }

    // Нет в CRM или неактивен — смотрим есть ли заказы
    const ordersCount = await prisma.order.count({ where: { courierId: c.id } });
    const tasksCount  = await prisma.konsolTask.count({ where: { courierId: c.id } });

    if (ordersCount > 0 || tasksCount > 0) {
      // Есть история — только деактивируем
      if (c.isActive) {
        await prisma.courier.update({ where: { id: c.id }, data: { isActive: false } });
        console.log(`  ⏸  Деактивировали (есть история): ${c.fullName} (ID ${c.id}) — ${ordersCount} заказов, ${tasksCount} заданий`);
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Нет истории — удаляем
      await prisma.courier.delete({ where: { id: c.id } });
      console.log(`  🗑  Удалили (нет истории): ${c.fullName} (ID ${c.id})`);
      deleted++;
    }
  }

  // 3. Upsert всех активных из CRM (добавляем новых, обновляем старых)
  console.log(`\n🔄 Синхронизируем активных из CRM...`);
  let synced = 0;
  for (const c of crmCouriers) {
    if (!activeCrmIds.has(c.id)) continue;

    const nameParts = [c.firstName, c.patronymic, c.lastName].filter(Boolean);
    const fullName = nameParts.join(' ');
    const crmPhone = c.phone?.number || null;
    const existing = await prisma.courier.findUnique({ where: { id: c.id } });

    await prisma.courier.upsert({
      where: { id: c.id },
      update: {
        firstName: c.firstName || null,
        lastName: c.lastName || null,
        patronymic: c.patronymic || null,
        fullName,
        description: c.description || null,
        isActive: true,
        ...(existing?.email ? {} : { email: c.email || null }),
        ...(existing?.phone ? {} : { phone: crmPhone }),
      },
      create: {
        id: c.id,
        firstName: c.firstName || null,
        lastName: c.lastName || null,
        patronymic: c.patronymic || null,
        fullName,
        phone: crmPhone,
        email: c.email || null,
        description: c.description || null,
        isActive: true,
      },
    });
    synced++;
  }

  console.log(`\n✅ Готово!`);
  console.log(`   Синхронизировано из CRM: ${synced}`);
  console.log(`   Обновлено/деактивировано: ${updated}`);
  console.log(`   Удалено (без истории): ${deleted}`);
  console.log(`   Пропущено (уже неактивны): ${skipped}`);

  await prisma.$disconnect();
}

run().catch(e => {
  console.error('❌ Ошибка:', e.message || e);
  process.exit(1);
});