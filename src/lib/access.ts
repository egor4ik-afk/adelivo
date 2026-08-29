// src/lib/access.ts
// Единая точка правды по доступу к магазинам.
// Правило одно: суперадмин видит всё, остальные — то, что отмечено галочками,
// но только если у пользователя включён accessRestricted.
//
// Пока accessRestricted = false у всех — поведение ровно такое же, как сейчас
// (все видят все заказы). Ограничения включаются по одному пользователю,
// поэтому раскатка не ломает работающий кабинет.

import { prisma } from "./prisma";
import { getSession } from "./auth";
import type { NextRequest } from "next/server";

export type Viewer = {
  id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  accessRestricted: boolean;
  companyId: string | null;
};

/** Пользователь текущего запроса вместе с флагами доступа. */
export async function getViewer(req?: NextRequest): Promise<Viewer | null> {
  const session = await getSession(req);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true, email: true, role: true,
      isSuperAdmin: true, accessRestricted: true, companyId: true,
    },
  });
  return user as Viewer | null;
}

/**
 * Список id магазинов, доступных пользователю.
 * null означает «ограничений нет» — это НЕ то же самое, что пустой массив.
 * Пустой массив = не видит ничего.
 */
export async function visibleShopIds(viewer: Viewer): Promise<string[] | null> {
  if (viewer.isSuperAdmin) return null;
  if (!viewer.accessRestricted) return null;

  const rows = await prisma.shopAccess.findMany({
    where: { userId: viewer.id },
    select: { shopId: true },
  });
  return rows.map((r) => r.shopId);
}

/**
 * Кусок where для запросов к заказам.
 * Использование:
 *   const where = { ...restOfFilters, ...(await shopFilter(viewer)) };
 */
export async function shopFilter(viewer: Viewer): Promise<Record<string, unknown>> {
  const ids = await visibleShopIds(viewer);
  if (ids === null) return {};
  if (ids.length === 0) return { shopId: { in: [] as string[] } }; // ничего не отдаём
  return { shopId: { in: ids } };
}

/** Может ли пользователь смотреть конкретный магазин. */
export async function canViewShop(viewer: Viewer, shopId: string): Promise<boolean> {
  const ids = await visibleShopIds(viewer);
  return ids === null || ids.includes(shopId);
}

/** Может ли редактировать заказы магазина (галочка canEdit в матрице). */
export async function canEditShop(viewer: Viewer, shopId: string): Promise<boolean> {
  if (viewer.isSuperAdmin) return true;
  if (!viewer.accessRestricted) return true;
  const row = await prisma.shopAccess.findUnique({
    where: { userId_shopId: { userId: viewer.id, shopId } },
    select: { canEdit: true },
  });
  return !!row?.canEdit;
}

/** Проверка доступа к заказу — по магазину, к которому он привязан. */
export async function canViewOrder(viewer: Viewer, orderId: string): Promise<boolean> {
  const ids = await visibleShopIds(viewer);
  if (ids === null) return true;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { shopId: true },
  });
  if (!order?.shopId) return true; // заказ без магазина виден всем — до бэкфилла
  return ids.includes(order.shopId);
}

/** Только для глобальной админки. Бросает, если прав нет. */
export async function requireSuperAdmin(req?: NextRequest): Promise<Viewer> {
  const viewer = await getViewer(req);
  if (!viewer) throw new AccessError("Unauthorized", 401);
  if (!viewer.isSuperAdmin) throw new AccessError("Недостаточно прав", 403);
  return viewer;
}

export class AccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "AccessError";
  }
}
