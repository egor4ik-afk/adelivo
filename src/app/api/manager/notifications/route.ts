import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const isHistory = url.searchParams.get('history') === 'true';

    const notifications = await prisma.managerNotification.findMany({
      where: {
        isSeen: isHistory, // Если history=true, отдаем прочитанные
      },
      // Новые сортируем по времени прибытия, а историю по дате скрытия (самые свежие сверху)
      orderBy: isHistory ? { createdAt: 'desc' } : { newValue: 'asc' },
      take: isHistory ? 50 : undefined, // Для истории отдаем последние 50, чтобы не грузить базу
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error('Ошибка получения уведомлений:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
