import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getViewer, accessibleCourierIds } from '@/lib/access';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewer(req);
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // У ManagerNotification нет поля компании, зато есть courierId.
    // Через список курьеров компании и отсекаем чужие плашки.
    // Записи без курьера (UNASSIGNED) видит только глобальный админ:
    // понять, чьи они, по самой записи невозможно.
    const courierIds = await accessibleCourierIds(viewer);
    const scope = courierIds === null
      ? {}
      : { courierId: { in: courierIds.map(String) } };

    const url = new URL(req.url);
    const isHistory = url.searchParams.get('history') === 'true';

    const notifications = await prisma.managerNotification.findMany({
      where: {
        isSeen: isHistory, // Если history=true, отдаем прочитанные
        ...scope,
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
