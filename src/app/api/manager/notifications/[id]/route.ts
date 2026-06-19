import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> } // 🔥 Типизируем как Promise
) {
  try {
    // 🔥 Достаем id через await
    const params = await context.params;
    const id = params.id;

    const updatedNotification = await prisma.managerNotification.update({
      where: { id },
      data: { isSeen: true },
    });

    return NextResponse.json(updatedNotification);
  } catch (error) {
    console.error('Ошибка скрытия уведомления:', error);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}