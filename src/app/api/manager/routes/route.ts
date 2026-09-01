import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getViewer, courierScope } from '@/lib/access';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewer(req);
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Получаем текущую дату в Москве в формате YYYY-MM-DD
    const moscowTodayStr = new Date().toLocaleDateString('en-CA', { 
      timeZone: 'Europe/Moscow' 
    });

    // 2. Вытягиваем последние маршруты с курьерами и заказами
    const routes = await prisma.route.findMany({
      // Маршрут принадлежит курьеру, курьер — компании.
      // Через это и режем чужие маршруты вместе с их заказами.
      where: { courier: await courierScope(viewer) },
      include: {
        courier: true,
        orders: {
          orderBy: { id: 'asc' } 
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Берем с запасом последние собранные маршруты
    });

    // 3. Фильтруем: оставляем только те, у которых первая точка назначена на СЕГОДНЯ
    const todayRoutes = routes.filter((route) => {
      const firstOrder = route.orders?.[0] as any;
      if (!firstOrder) return false; // Пустые маршруты без точек нам не нужны

      // Проверяем поле даты (поддерживаем и строку, и Date-объект, и deliveryDate)
      const rawDate = firstOrder.date || firstOrder.deliveryDate;
      if (!rawDate) return false;

      const orderDateStr = rawDate instanceof Date
        ? rawDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' })
        : String(rawDate).split('T')[0]; // Отрезаем время, если там ISO-строка

      return orderDateStr === moscowTodayStr;
    });

    return NextResponse.json(todayRoutes);
  } catch (error) {
    console.error('Ошибка загрузки маршрутов менеджера:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}