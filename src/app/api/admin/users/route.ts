
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getViewer, adminUserScope, canManageUser } from '@/lib/access';
import type { NextRequest } from 'next/server';
// GET: Получить всех пользователей для таблицы в админке
export async function GET(req: NextRequest) {
  try {
    const viewer = await getViewer(req);
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (viewer.role !== 'ADMIN' && !viewer.isSuperAdmin) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    // ВНИМАНИЕ: Если модель называется не user, замени prisma.user на свою (например, prisma.courier)
    const users = await prisma.user.findMany({
      where: adminUserScope(viewer),
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, companyId: true },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Ошибка получения пользователей' }, { status: 500 });
  }
}

// PATCH: Изменить роль пользователя
export async function PATCH(request: NextRequest) {
  try {
    const viewer = await getViewer(request);
    if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (viewer.role !== 'ADMIN' && !viewer.isSuperAdmin) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
    }

    const { userId, role } = await request.json();

    // Локальный админ не должен менять роли чужим сотрудникам
    if (!(await canManageUser(viewer, userId))) {
      return NextResponse.json({ error: 'Этот пользователь не из вашей компании' }, { status: 403 });
    }

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
