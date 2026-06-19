import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const notifications = await prisma.managerNotification.findMany({
      where: {
        isSeen: false, // Отдаем только те, что менеджер еще не скрыл
      },
      orderBy: {
        baseTime: 'asc', // Сразу сортируем по времени на уровне БД
      },
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error('Ошибка получения уведомлений:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
