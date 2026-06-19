import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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
