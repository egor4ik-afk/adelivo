import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Берем маршруты начиная с начала текущего дня
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const routes = await prisma.route.findMany({
      where: {
        createdAt: { gte: today }
      },
      include: {
        courier: true,
        points: {
          include: { order: true },
          orderBy: { id: 'asc' } // или position, если у вас такое поле
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(routes);
  } catch (error) {
    console.error('Ошибка загрузки маршрутов:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}