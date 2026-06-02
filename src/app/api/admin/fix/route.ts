import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function POST() {
  try {
    // Точные данные из логов и выгрузки CSV (Сумма с учетом МКАД и кол-во)
    const targetData = [
      { phone: "+79154035910", konsolId: "1513095", amount: 4240, count: 8 },    // Паянова
      { phone: "+79104298469", konsolId: "1513611", amount: 4770, count: 9 },    // Филюнина
      { phone: "+79686525866", konsolId: "1429342", amount: 23002, count: 37 },  // Филиппов
      { phone: "+79504174222", konsolId: "1510835", amount: 18762, count: 33 },  // Гартвих
      { phone: "+79661847474", konsolId: "1505791", amount: 28726, count: 47 },  // Мусаева
      { phone: "+79055036063", konsolId: "1476524", amount: 59360, count: 74 },  // Колосов
      { phone: "+79384439003", konsolId: "1500148", amount: 42188, count: 74 },  // Ростамова
      { phone: "+79017843033", konsolId: "1443210", amount: 8480, count: 16 },   // Галушко
      { phone: "+79099407557", konsolId: null, amount: 9646, count: 15 },        // Шубин
      { phone: "+79859836007", konsolId: null, amount: 15370, count: 25 },       // Третьяков
      { phone: "+79162685738", konsolId: null, amount: 32012, count: 38 },       // Татьяна (Ваш аккаунт)
      { phone: "+79688277784", konsolId: null, amount: 6254, count: 11 },        // Фадеев
      { phone: "+79857899493", konsolId: null, amount: 1484, count: 2 },         // Алиев Р.
      { phone: "+79831462621", konsolId: null, amount: 5300, count: 10 }         // Шалда
    ];

    let updatedTasks = 0;
    const errors: string[] = [];

    for (const item of targetData) {
      // 1. Ищем курьера по нормальному маппингу (телефон ИЛИ ID консоли)
      const courier = await prisma.courier.findFirst({
        where: {
          OR: [
            { phone: item.phone },
            ...(item.konsolId ? [{ konsolContractorId: item.konsolId }] : [])
          ]
        }
      });

      if (!courier) {
        errors.push(`Не найден курьер в БД: ${item.phone}`);
        continue;
      }

      // 2. Обновляем его задание за проблемную неделю
      const updateResult = await prisma.konsolTask.updateMany({
        where: {
          courierId: courier.id,
          date: {
            gte: new Date('2026-05-25T00:00:00.000Z'),
            lte: new Date('2026-05-31T23:59:59.999Z'),
          }
        },
        data: {
          amount: item.amount,
          ordersCount: item.count
        }
      });

      updatedTasks += updateResult.count;
    }

    return NextResponse.json({ 
      success: true, 
      message: "Суммы успешно восстановлены по маппингу!",
      updatedTasks,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error: any) {
    console.error('Ошибка скрипта:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}