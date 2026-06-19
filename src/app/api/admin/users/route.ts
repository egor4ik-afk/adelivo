
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// GET: Получить всех пользователей для таблицы в админке
export async function GET() {
  try {
    // ВНИМАНИЕ: Если модель называется не user, замени prisma.user на свою (например, prisma.courier)
    const users = await prisma.user.findMany({
      select: { id: true, firstName: true, email: true, phone: true, role: true },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Ошибка получения пользователей' }, { status: 500 });
  }
}

// PATCH: Изменить роль пользователя
export async function PATCH(request: Request) {
  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json({ error: 'Нужны userId и role' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Ошибка обновления роли' }, { status: 500 });
  }
}
