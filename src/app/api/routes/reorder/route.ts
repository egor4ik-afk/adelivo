import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { items } = await request.json(); 
    // Ожидаем массив: [{ id: "uuid", sortOrder: 0 }, { id: "uuid", sortOrder: 1 }]

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    // Запускаем массовое обновление в транзакции
    await prisma.$transaction(
      items.map((item) =>
        prisma.route.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to reorder routes:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
