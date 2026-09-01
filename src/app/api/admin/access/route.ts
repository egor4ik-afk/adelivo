// src/app/api/admin/access/route.ts
// Глобальная админка: чтение и запись матрицы «пользователь × магазин».
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminScope, canManageUser, AccessError } from "@/lib/access";

export const dynamic = "force-dynamic";

/** GET — вся матрица разом: пользователи, магазины, отмеченные галочки. */
export async function GET(req: NextRequest) {
  try {
    const { scope } = await requireAdminScope(req);

    const [users, shops, access, couriers] = await Promise.all([
      prisma.user.findMany({
        where: scope,
        select: {
          id: true, email: true, role: true, firstName: true, lastName: true,
          isSuperAdmin: true, accessRestricted: true, companyId: true, lastLoginAt: true,
        },
        orderBy: [{ role: "asc" }, { email: "asc" }],
      }),
      prisma.shop.findMany({
        where: scope,
        select: { id: true, slug: true, name: true, isActive: true, companyId: true },
        orderBy: { name: "asc" },
      }),
      prisma.shopAccess.findMany({ select: { userId: true, shopId: true, canEdit: true } }),
      // Профили курьеров: связь с пользователем по email, как и во всём остальном коде
      prisma.courier.findMany({
        where: scope,
        select: { id: true, email: true, fullName: true, isApproved: true, isActive: true },
      }),
    ]);

    return NextResponse.json({ users, shops, access, couriers });
  } catch (e) {
    if (e instanceof AccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/access GET]", e);
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
  }
}

/**
 * PATCH — переключение одной галочки или флага пользователя.
 * Тело: { userId, shopId, checked }        — галочка доступа
 *       { userId, shopId, canEdit }        — право редактирования
 *       { userId, accessRestricted }       — включить ограничения для пользователя
 *       { userId, isSuperAdmin }           — сделать глобальным админом
 */
export async function PATCH(req: NextRequest) {
  try {
    const { viewer, scope } = await requireAdminScope(req);
    const b = await req.json();

    if (!b.userId) {
      return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
    }

    // Локальный админ управляет только своими людьми
    if (!(await canManageUser(viewer, b.userId))) {
      return NextResponse.json({ error: "Этот пользователь не из вашей компании" }, { status: 403 });
    }

    // Допуск курьера к работе
    if (b.courierApproved !== undefined) {
      const user = await prisma.user.findUnique({
        where: { id: b.userId },
        select: { email: true },
      });
      if (!user?.email) {
        return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
      }
      const res = await prisma.courier.updateMany({
        where: { email: { equals: user.email, mode: "insensitive" } },
        data: { isApproved: !!b.courierApproved },
      });
      if (res.count === 0) {
        return NextResponse.json(
          { error: "У этого пользователя ещё нет профиля курьера — он появится после первого входа" },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Флаги пользователя
    if (b.accessRestricted !== undefined) {
      await prisma.user.update({
        where: { id: b.userId },
        data: { accessRestricted: !!b.accessRestricted },
      });
      return NextResponse.json({ ok: true });
    }

    if (b.isSuperAdmin !== undefined) {
      if (!viewer.isSuperAdmin) {
        return NextResponse.json(
          { error: "Назначать глобального админа может только глобальный админ" },
          { status: 403 }
        );
      }
      // Защита от отстрела последнего суперадмина
      if (!b.isSuperAdmin) {
        const count = await prisma.user.count({ where: { isSuperAdmin: true } });
        if (count <= 1) {
          return NextResponse.json(
            { error: "Нельзя снять флаг с последнего глобального админа" },
            { status: 400 }
          );
        }
        if (b.userId === viewer.id) {
          return NextResponse.json(
            { error: "Нельзя снять флаг с самого себя" },
            { status: 400 }
          );
        }
      }
      await prisma.user.update({
        where: { id: b.userId },
        data: { isSuperAdmin: !!b.isSuperAdmin },
      });
      return NextResponse.json({ ok: true });
    }

    // Галочка доступа к магазину
    if (!b.shopId) {
      return NextResponse.json({ error: "shopId обязателен" }, { status: 400 });
    }

    if (b.canEdit !== undefined) {
      await prisma.shopAccess.update({
        where: { userId_shopId: { userId: b.userId, shopId: b.shopId } },
        data: { canEdit: !!b.canEdit },
      });
      return NextResponse.json({ ok: true });
    }

    // Пока у пользователя accessRestricted = false, он видит все магазины
    // своей компании, а строк в матрице у него нет. Первое снятие галочки
    // должно означать «ограничить»: включаем режим и выдаём доступ ко всем
    // магазинам, КРОМЕ снятого. Иначе снятие галочки выглядело бы как
    // «ничего не изменилось» — ровно то, на что вы наткнулись.
    const target = await prisma.user.findUnique({
      where: { id: b.userId },
      select: { accessRestricted: true, companyId: true },
    });

    if (!target?.accessRestricted && !b.checked) {
      const shops = await prisma.shop.findMany({
        where: target?.companyId ? { companyId: target.companyId } : {},
        select: { id: true },
      });

      await prisma.$transaction([
        prisma.user.update({ where: { id: b.userId }, data: { accessRestricted: true } }),
        prisma.shopAccess.deleteMany({ where: { userId: b.userId } }),
        prisma.shopAccess.createMany({
          data: shops
            .filter((s) => s.id !== b.shopId)
            .map((s) => ({ userId: b.userId, shopId: s.id })),
          skipDuplicates: true,
        }),
      ]);

      return NextResponse.json({ ok: true, restrictedNow: true });
    }

    if (b.checked) {
      await prisma.shopAccess.upsert({
        where: { userId_shopId: { userId: b.userId, shopId: b.shopId } },
        update: {},
        create: { userId: b.userId, shopId: b.shopId },
      });
    } else {
      await prisma.shopAccess.deleteMany({
        where: { userId: b.userId, shopId: b.shopId },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/access PATCH]", e);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
