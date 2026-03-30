// fix-auto-prices.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Надбавка для авто-курьера
const AUTO_SURCHARGE = 100;

async function fixAutoPrices() {
  console.log("🔍 Ищем заказы с назначенными авто-курьерами...");

  try {
    // 1. Находим всех авто-курьеров
    const autoCouriers = await prisma.courier.findMany({
      where: { isAuto: true },
      select: { id: true, fullName: true }
    });
    
    const autoCourierIds = autoCouriers.map(c => c.id);
    if (autoCourierIds.length === 0) {
      console.log("🤷‍♂️ В базе нет авто-курьеров.");
      return;
    }

    // 2. Ищем сегодняшние заказы (или недавние), назначенные на авто-курьеров
    // Берем за последние 2-3 дня, чтобы точно зацепить все сбитые
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 3);

    const orders = await prisma.order.findMany({
      where: {
        courierId: { in: autoCourierIds },
        createdAt: { gte: dateLimit },
        price: { not: null }
      }
    });

    let fixedCount = 0;

    for (const order of orders) {
      const currentPrice = order.price;

      // Простейшая логика: если цена кратна 100, но не имеет надбавки (например 500, 900, 1300)
      // В RetailCRM базовые цены обычно: 500, 600, 900, 1000, 1300, 1400.
      // Если у заказа цена 500, а курьер авто — значит надо сделать 600.
      // Если 900 -> 1000. 
      // Если она УЖЕ 600 (500+100) или 1000 (900+100) — не трогаем.

      // Массив "базовых" цен, которые 100% потеряли надбавку
      const basePricesThatNeedFix = [500, 900, 1300, 1400]; // Добавь сюда свои, если есть другие
      
      if (basePricesThatNeedFix.includes(currentPrice)) {
        const fixedPrice = currentPrice + AUTO_SURCHARGE;
        
        await prisma.order.update({
          where: { id: order.id },
          data: { price: fixedPrice }
        });
        
        console.log(`✅ Починили заказ CRM ID: ${order.crmId}. Цена: ${currentPrice} -> ${fixedPrice}`);
        fixedCount++;
      }
    }

    console.log(`\n🎉 Готово! Исправлено цен: ${fixedCount}`);

  } catch (error) {
    console.error("❌ Ошибка при починке:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixAutoPrices();