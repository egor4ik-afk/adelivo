// src/lib/access.ts
// Доступ определяется МАТРИЦЕЙ, а не компанией.
//
// Было: companyId жёстко резал всё, а галочки лишь сужали доступ внутри
// компании. Из-за этого «снять галочку» работало только на заказах,
// а всё остальное всё равно упиралось в companyId.
//
// Стало — две разные вещи, и их важно не путать:
//
//   ShopAccess  — ЧТО видно: заказы, курьеры, маршруты, чат.
//                 Источник правды. Нет строк — нет данных.
//   companyId   — ОТКУДА человек пришёл: по чьей ссылке зарегистрировался.
//                 Нужен для админки (кем можно управлять) и для решения,
//                 отправлять ли курьера в CRM. На видимость данных не влияет.
//
// Практическое следствие: чтобы дать сотруднику доступ к магазину другой
// компании, достаточно поставить галочку. Раньше это было невозможно.

import { prisma } from "./prisma";
import { getSession } from "./auth";
import type { NextRequest } from "next/server";

export type Viewer = {
  id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  accessRestricted: boolean; // устарело, оставлено для совместимости схемы
  companyId: string | null;
  /// Может выкладывать заказы на биржу. У админа право есть всегда,
  /// остальным выдаётся галочкой в матрице.
  canPostExchange: boolean;
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
      canPostExchange: true,
    },
  });
  return user as Viewer | null;
}

/**
 * Магазины, доступные пользователю.
 * null — ограничений нет (глобальный админ).
 * Пустой массив — доступа нет ни к чему.
 */
export async function visibleShopIds(viewer: Viewer): Promise<string[] | null> {
  if (viewer.isSuperAdmin) return null;

  const rows = await prisma.shopAccess.findMany({
    where: { userId: viewer.id },
    select: { shopId: true },
  });
  return rows.map((r) => r.shopId);
}

/**
 * Компании, к магазинам которых есть доступ.
 * Через них ограничиваются сущности, у которых своего магазина нет:
 * курьеры, маршруты, плашки менеджера.
 */
export async function accessibleCompanyIds(viewer: Viewer): Promise<string[] | null> {
  if (viewer.isSuperAdmin) return null;

  const shopIds = await visibleShopIds(viewer);
  if (!shopIds || shopIds.length === 0) return [];

  const shops = await prisma.shop.findMany({
    where: { id: { in: shopIds } },
    select: { companyId: true },
  });
  return [...new Set(shops.map((s) => s.companyId).filter(Boolean) as string[])];
}

/** Кусок where для заказов. */
export async function shopFilter(viewer: Viewer): Promise<Record<string, unknown>> {
  const ids = await visibleShopIds(viewer);
  if (ids === null) return {};
  return { shopId: { in: ids } };
}

/**
 * Кусок where для курьеров.
 *
 * Курьер виден по двум признакам, и второй важнее первого:
 *   1. он в компании, чьи магазины вам доступны;
 *   2. он возит заказы ваших магазинов.
 *
 * Второй нужен, потому что у курьеров, заведённых до появления компаний,
 * companyId пустой — по первому признаку они не находились, и список
 * курьеров в дашборде оказывался пустым. Курьер, который уже развозит
 * ваши заказы, ваш по факту, независимо от того, что записано в профиле.
 */
export async function courierScope(viewer: Viewer): Promise<Record<string, unknown>> {
  const companies = await accessibleCompanyIds(viewer);
  if (companies === null) return {};

  const shopIds = await visibleShopIds(viewer);
  if (!shopIds || shopIds.length === 0) {
    return { companyId: { in: companies } };
  }

  const rows = await prisma.order.findMany({
    where: { shopId: { in: shopIds }, courierId: { not: null } },
    select: { courierId: true },
    distinct: ["courierId"],
    take: 500,
  });
  const courierIds = rows.map((r) => r.courierId!).filter(Boolean);

  if (courierIds.length === 0) return { companyId: { in: companies } };

  return { OR: [{ companyId: { in: companies } }, { id: { in: courierIds } }] };
}

/** Идентификаторы курьеров, доступных пользователю. */
export async function accessibleCourierIds(viewer: Viewer): Promise<number[] | null> {
  if (viewer.isSuperAdmin) return null;

  const where = await courierScope(viewer);
  const rows = await prisma.courier.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Кусок where для списков людей в рабочих разделах (чат, поиск сотрудников).
 * Виден тот, с кем есть хотя бы один общий магазин — это и есть «коллега».
 */
export async function coworkerScope(viewer: Viewer): Promise<Record<string, unknown>> {
  if (viewer.isSuperAdmin) return {};

  const shopIds = await visibleShopIds(viewer);
  if (!shopIds || shopIds.length === 0) return { id: { in: [] as string[] } };

  return { shopAccess: { some: { shopId: { in: shopIds } } } };
}

/**
 * Кусок where для АДМИНКИ: кем можно управлять.
 * Здесь companyId уместен — управление людьми идёт по принадлежности,
 * а не по совпадению магазинов. Иначе новый сотрудник без единой галочки
 * был бы не виден тому, кто должен эти галочки ему поставить.
 */
export function adminUserScope(viewer: Viewer): Record<string, unknown> {
  if (viewer.isSuperAdmin) return {};
  if (!viewer.companyId) return { id: { in: [] as string[] } };
  return { companyId: viewer.companyId };
}

/** То же для курьеров в админке. */
export function adminCourierScope(viewer: Viewer): Record<string, unknown> {
  if (viewer.isSuperAdmin) return {};
  if (!viewer.companyId) return { id: { in: [] as number[] } };
  return { companyId: viewer.companyId };
}

/** Может ли редактировать заказы магазина. */
export async function canEditShop(viewer: Viewer, shopId: string): Promise<boolean> {
  if (viewer.isSuperAdmin) return true;
  const row = await prisma.shopAccess.findUnique({
    where: { userId_shopId: { userId: viewer.id, shopId } },
    select: { canEdit: true },
  });
  return !!row?.canEdit;
}

/** Доступ к конкретному заказу — по его магазину. */
export async function canViewOrder(viewer: Viewer, orderId: string): Promise<boolean> {
  const ids = await visibleShopIds(viewer);
  if (ids === null) return true;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { shopId: true },
  });
  // Заказ без магазина — «ничей», его видит только глобальный админ
  if (!order?.shopId) return false;
  return ids.includes(order.shopId);
}

/** Только для глобальной админки. */
export async function requireSuperAdmin(req?: NextRequest): Promise<Viewer> {
  const viewer = await getViewer(req);
  if (!viewer) throw new AccessError("Unauthorized", 401);
  if (!viewer.isSuperAdmin) throw new AccessError("Недостаточно прав", 403);
  return viewer;
}

/** Админка доступов: глобальный админ и админ компании. */
export async function requireAdminScope(req?: NextRequest): Promise<{
  viewer: Viewer;
  scope: Record<string, unknown>;
  courierScopeWhere: Record<string, unknown>;
}> {
  const viewer = await getViewer(req);
  if (!viewer) throw new AccessError("Unauthorized", 401);

  if (viewer.isSuperAdmin || (viewer.role === "ADMIN" && viewer.companyId)) {
    return {
      viewer,
      scope: adminUserScope(viewer),
      courierScopeWhere: adminCourierScope(viewer),
    };
  }

  throw new AccessError("Недостаточно прав", 403);
}

/** Может ли этот админ трогать конкретного пользователя. */
export async function canManageUser(viewer: Viewer, userId: string): Promise<boolean> {
  if (viewer.isSuperAdmin) return true;
  if (viewer.role !== "ADMIN" || !viewer.companyId) return false;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true, isSuperAdmin: true },
  });
  // Локальный админ не трогает глобального — иначе снял бы с него флаг
  if (!target || target.isSuperAdmin) return false;
  return target.companyId === viewer.companyId;
}

/**
 * Выдать пользователю доступ ко всем магазинам компании.
 * Вызывается при входе по ссылке-приглашению и при создании магазина —
 * иначе новый сотрудник или новый магазин остаются невидимыми.
 */
export async function grantCompanyShops(userId: string, companyId: string): Promise<number> {
  const shops = await prisma.shop.findMany({
    where: { companyId },
    select: { id: true },
  });
  if (shops.length === 0) return 0;

  const res = await prisma.shopAccess.createMany({
    data: shops.map((s) => ({ userId, shopId: s.id })),
    skipDuplicates: true,
  });
  return res.count;
}

/** Выдать доступ к новому магазину всем сотрудникам компании. */
export async function grantShopToCompany(shopId: string, companyId: string): Promise<number> {
  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true },
  });
  if (users.length === 0) return 0;

  const res = await prisma.shopAccess.createMany({
    data: users.map((u) => ({ userId: u.id, shopId })),
    skipDuplicates: true,
  });
  return res.count;
}

export class AccessError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "AccessError";
  }
}

/** Может ли пользователь выкладывать заказы на биржу. */
export function canPostToExchange(viewer: Viewer): boolean {
  return viewer.isSuperAdmin || viewer.role === "ADMIN" || viewer.canPostExchange;
}
