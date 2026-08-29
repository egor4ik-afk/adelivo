// src/app/api/admin/access/route.ts
// Глобальная админка: чтение и запись матрицы «пользователь × магазин».
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, AccessError } from "@/lib/access";

export const dynamic = "force-dynamic";

/** GET — вся матрица разом: пользователи, магазины, отмеченные галочки. */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);

    const [users, shops, access] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true, email: true, role: true, firstName: true, lastName: true,
          isSuperAdmin: true, accessRestricted: true, companyId: true, lastLoginAt: true,
        },
        orderBy: [{ role: "asc" }, { email: "asc" }],
      }),
      prisma.shop.findMany({
        select: { id: true, slug: true, name: true, isActive: true, companyId: true },
        orderBy: { name: "asc" },
      }),
      prisma.shopAccess.findMany({ select: { userId: true, shopId: true, canEdit: true } }),
    ]);

    return NextResponse.json({ users, shops, access });
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
    const viewer = await requireSuperAdmin(req);
    const b = await req.json();

    if (!b.userId) {
      return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
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
