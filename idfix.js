import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function mergeCouriers() {
  // 🔥 ЖЕСТКО ЗАДАЕМ ID
  const oldId = 271;
  const newId = 291; 

  try {
    const oldCourier = await prisma.courier.findUnique({ where: { id: oldId } });
    const newCourier = await prisma.courier.findUnique({ where: { id: newId } });

    if (!oldCourier) throw new Error(`Старый курьер с ID ${oldId} не найден.`);
    if (!newCourier) throw new Error(`Новый курьер с ID ${newId} не найден.`);

    console.log(`🚀 Начинаем перенос: ID ${oldId} -> ID ${newId} (${newCourier.fullName})`);

    // 2. Переносим Заказы
    const ordersResult = await prisma.order.updateMany({
      where: { courierId: oldId },
      data: { courierId: newId, courier: newCourier.fullName },
    });
    console.log(`✅ Заказы перенесены: ${ordersResult.count}`);

    // 3. Переносим Маршруты
    const routesResult = await prisma.route.updateMany({
      where: { courierId: oldId },
      data: { courierId: newId },
    });
    console.log(`✅ Маршруты перенесены: ${routesResult.count}`);

    // 4. Переносим Смены
    const shifts = await prisma.courierShift.findMany({ where: { courierId: oldId } });
    let shiftsMoved = 0;
    for (const shift of shifts) {
      try {
        await prisma.courierShift.update({
          where: { id: shift.id },
          data: { courierId: newId },
        });
        shiftsMoved++;
      } catch (error) {
        await prisma.courierShift.delete({ where: { id: shift.id } });
      }
    }
    console.log(`✅ Смены перенесены: ${shiftsMoved}`);

    // 5. Переносим Платежи
    const payments = await prisma.courierPayment.findMany({ where: { courierId: oldId } });
    let paymentsMoved = 0;
    for (const payment of payments) {
      try {
        await prisma.courierPayment.update({
          where: { id: payment.id },
          data: { courierId: newId },
        });
        paymentsMoved++;
      } catch (error) {
        await prisma.courierPayment.delete({ where: { id: payment.id } });
      }
    }
    console.log(`✅ Платежи перенесены: ${paymentsMoved}`);

    // 6. Переносим Задачи Консоли
    const tasks = await prisma.konsolTask.findMany({ where: { courierId: oldId } });
    let tasksMoved = 0;
    for (const task of tasks) {
      try {
        await prisma.konsolTask.update({
          where: { id: task.id },
          data: { courierId: newId },
        });
        tasksMoved++;
      } catch (error) {
        await prisma.konsolTask.delete({ where: { id: task.id } });
      }
    }
    console.log(`✅ Задачи Консоли перенесены: ${tasksMoved}`);

    // 7. Удаляем старого курьера
    await prisma.courier.delete({
      where: { id: oldId },
    });
    console.log(`✅ Старый курьер (ID ${oldId}) успешно удален!`);

  } catch (error) {
    console.error('❌ Ошибка при выполнении скрипта:', error);
  } finally {
    await prisma.$disconnect();
  }
}

mergeCouriers();