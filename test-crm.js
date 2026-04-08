const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearAllContacts() {
  console.log("⏳ Начинаем очистку имен и номеров телефонов у всех заказов...");
  
  try {
    const result = await prisma.order.updateMany({
      data: {
        recipientPhone: null,
        name: null
      }
    });
    
    console.log(`✅ Успешно! Очищено записей: ${result.count}`);
  } catch (error) {
    console.error("❌ Ошибка при очистке БД:", error);
  } finally {
    await prisma.$disconnect();
  }
}

clearAllContacts();