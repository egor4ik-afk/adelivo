const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearAllPhones() {
  console.log("⏳ Начинаем очистку номеров телефонов у всех заказов...");
  
  try {
    const result = await prisma.order.updateMany({
      data: {
        recipientPhone: null
      }
    });
    
    console.log(`✅ Успешно! Очищено номеров: ${result.count}`);
  } catch (error) {
    console.error("❌ Ошибка при очистке БД:", error);
  } finally {
    await prisma.$disconnect();
  }
}

clearAllPhones();