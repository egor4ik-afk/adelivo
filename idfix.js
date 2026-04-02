import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function mergeCouriers() {
  const oldId = 242;
  const newName = 'Симдянов Артём';

  try {
    // 1. Находим обоих курьеров
    const oldCourier = await prisma.courier.findUnique({
      where: { id: oldId }
    });

    const newCourier = await prisma.courier.findFirst({
      where: { fullName: { contains: newName } }
    });

    if (!oldCourier) throw new Error(`Старый курьер с ID ${oldId} не найден.`);
    if (!newCourier) throw new Error(`Новый курьер "${newName}" не найден.`);

    const newId = newCourier.id;
    console.log(`Начинаем перенос: ID ${oldId} -> ID ${newId} (${newCourier.fullName})`);

    // 2. Переносим Заказы (точки)
    // У модели Order обновляем как courierId, так и строковое поле courier (имя)
    const ordersResult = await prisma.order.updateMany({
      where: { courierId: oldId },
      data: { 
        courierId: newId,
        courier: newCourier.fullName 
      },
    });
    console.log(`✅ Заказы перенесены: ${ordersResult.count}`);

    // 3. Переносим Маршруты
    const routesResult = await prisma.route.updateMany({
      where: { courierId: oldId },
      data: { courierId: newId },
    });
    console.log(`✅ Маршруты перенесены: ${routesResult.count}`);

    // 4. Переносим Смены ("проекты")
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
        // Если смена на эту дату уже есть у нового курьера, удаляем дубль старого
        await prisma.courierShift.delete({ where: { id: shift.id } });
      }
    }
    console.log(`✅ Смены перенесены: ${shiftsMoved} (удалено дублей: ${shifts.length - shiftsMoved})`);

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
    console.log(`✅ Платежи перенесены: ${paymentsMoved} (удалено дублей: ${payments.length - paymentsMoved})`);

    // 6. Переносим Задачи Консоли (если они подразумевались под "проектами")
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
    console.log(`✅ Старый курьер (ID ${oldId}) успешно удален.`);

  } catch (error) {
    console.error('❌ Ошибка при выполнении скрипта:', error);
  } finally {
    await prisma.$disconnect();
  }
}

mergeCouriers();