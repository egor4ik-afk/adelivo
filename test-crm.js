// import-meura.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runUpdateAndImport() {
  const apiKey = "3YxiSGgbHMlvXAgLPJp099on6YvjkxrQ";
  const todayStr = new Date().toISOString().split('T')[0]; // Сегодняшняя дата (ГГГГ-ММ-ДД)

  console.log("🛠 ШАГ 1: Присваиваем магазин 'bunch' всем старым заказам...");
  try {
    const updatedOldOrders = await prisma.order.updateMany({
      where: { 
        OR: [
          { shop: null },
          { shop: "" }
        ]
      },
      data: { shop: "bunch" }
    });
    console.log(`✅ Обновлено старых заказов: ${updatedOldOrders.count}.\n`);
  } catch (err) {
    console.log("⚠️ Ошибка при обновлении старых заказов:", err.message);
  }

  // --- ШАГ 2: ВЫГРУЗКА MEURA ---
  const date = new Date();
  date.setDate(date.getDate() - 7);
  const weekAgo = date.toISOString().split('T')[0];
  
  let page = 1;
  let totalPages = 1;
  let allOrders = [];

  console.log(`🚀 ШАГ 2: Скачиваем заказы Meura из CRM с ${weekAgo}...`);

  try {
    do {
      const apiUrl = `https://kaktusfiori.retailcrm.ru/api/v5/orders?filter[createdAtFrom]=${weekAgo}&page=${page}&limit=50`;
      const response = await fetch(apiUrl, { method: "GET", headers: { "X-API-KEY": apiKey } });
      const data = await response.json();

      if (!data.success) {
        console.log(`\n❌ Ошибка API:`, data.errorMsg);
        break;
      }

      allOrders = allOrders.concat(data.orders);
      totalPages = data.pagination.totalPageCount;
      page++;
      await new Promise(res => setTimeout(res, 200));

    } while (page <= totalPages && page <= 20);

    // Оставляем только Meura (фильтруем всё, где в коде есть 'bunch')
    const meuraOrders = allOrders.filter(order => !(order.site || "").toLowerCase().includes('bunch'));
    console.log(`✅ Найдено ${meuraOrders.length} заказов Meura. Записываем в БД...`);

    let added = 0;
    let updated = 0;

    for (const order of meuraOrders) {
      // Аккуратно достаем данные из структуры RetailCRM
      const crmIdStr = order.id.toString(); 
      const phoneRaw = order.phone || "";
      const nameRaw = order.firstName || "";
      const addressRaw = order.delivery?.address?.text || "";
      const commentRaw = order.customerComment || "";
      const shopCode = order.site || "unknown";
      const deliveryDateRaw = order.delivery?.date || null; 

      // 💡 УМНАЯ ЛОГИКА СТАТУСОВ
      // Если дата доставки есть и она строго меньше сегодняшней — заказ "DELIVERED"
      // Иначе оставляем "NEW" (для доставок на сегодня и будущие дни)
      let calculatedStatus = "NEW"; 
      if (deliveryDateRaw && deliveryDateRaw < todayStr) {
        calculatedStatus = "DELIVERED"; 
      }

      // СОХРАНЯЕМ В PRISMA (с точным совпадением полей твоей схемы)
      const savedOrder = await prisma.order.upsert({
        where: { crmId: crmIdStr },
        update: {
          recipientPhone: phoneRaw, // Используем твое поле recipientPhone!
          name: nameRaw,
          address: addressRaw,
          shop: shopCode,
          comment: commentRaw,
          deliveryDate: deliveryDateRaw,
          status: calculatedStatus 
        },
        create: {
          crmId: crmIdStr,
          status: calculatedStatus, 
          recipientPhone: phoneRaw, // Используем твое поле recipientPhone!
          name: nameRaw,
          address: addressRaw,
          shop: shopCode,
          comment: commentRaw,
          deliveryDate: deliveryDateRaw
        }
      });

      if (savedOrder.createdAt.getTime() === savedOrder.updatedAt.getTime()) {
        added++;
      } else {
        updated++;
      }
    }

    console.log("\n🎉 ИМПОРТ ЗАВЕРШЕН!");
    console.log(`➕ Добавлено новых заказов Meura: ${added}`);
    console.log(`🔄 Обновлено существующих: ${updated}`);

  } catch (error) {
    console.error("\n❌ Ошибка скрипта:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runUpdateAndImport();