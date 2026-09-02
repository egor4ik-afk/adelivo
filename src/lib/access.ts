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

/** Кусок where для курьеров. */
export async function courierScope(viewer: Viewer): Promise<Record<string, unknown>> {
  if (viewer.isSuperAdmin) return {};

  const shopIds = await visibleShopIds(viewer);
  if (!shopIds || shopIds.length === 0) return { id: { in: [] as number[] } };

  // Курьер виден, если у ЕГО учётной записи есть доступ к одному из ваших
  // магазинов. Именно это вы и отмечаете галочкой в матрице — раньше
  // галочка на видимость курьера не влияла вообще, потому что список
  // строился по Courier.companyId, а он у самостоятельно
  // зарегистрировавшихся курьеров пустой.
  //
  // Связь Courier ↔ User в проекте идёт по email, поэтому и здесь по нему.
  const users = await prisma.user.findMany({
    where: { shopAccess: { some: { shopId: { in: shopIds } } } },
    select: { email: true },
  });
  const emails = users.map((u) => u.email).filter(Boolean);

  // Второй признак — фактический: курьер, который уже возит заказы ваших
  // магазинов, ваш независимо от того, что записано в матрице.
  // Без него курьер пропадал из списка сразу после снятия с заказа.
  const rows = await prisma.order.findMany({
    where: { shopId: { in: shopIds }, courierId: { not: null } },
    select: { courierId: true },
    distinct: ["courierId"],
    take: 500,
  });
  const courierIds = rows.map((r) => r.courierId!).filter(Boolean);

  const or: Record<string, unknown>[] = [];
  if (emails.length) or.push({ email: { in: emails, mode: "insensitive" } });
  if (courierIds.length) or.push({ id: { in: courierIds } });

  // Совсем без признаков — пусто, чтобы не показать чужих
  if (or.length === 0) return { id: { in: [] as number[] } };

  return { OR: or };
}

/** Идентификаторы курьеров, доступных пользователю. */
export async function accessibleCourierIds(viewer: Viewer): Promise<number[] | null> {
  const companies = await accessibleCompanyIds(viewer);
  if (companies === null) return null;
  if (companies.length === 0) return [];

  const rows = await prisma.courier.findMany({
    where: { companyId: { in: companies } },
    select: { id: true },
  });
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
  // Плюс «ничьи»: их нужно видеть, чтобы принять в компанию
  return { OR: [{ companyId: viewer.companyId }, { companyId: null }] };
}

/** То же для курьеров в админке. */
export function adminCourierScope(viewer: Viewer): Record<string, unknown> {
  if (viewer.isSuperAdmin) return {};
  if (!viewer.companyId) return { id: { in: [] as number[] } };
  // Курьеры без компании видны админу в АДМИНКЕ: иначе «ничьего» курьера,
  // который зарегистрировался сам, некому подобрать — он не показывается
  // ни в одном списке и остаётся невидимкой навсегда.
  return { OR: [{ companyId: viewer.companyId }, { companyId: null }] };
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

  // Свой сотрудник — можно. «Ничей» — тоже: именно так его и принимают
  // в компанию. Раньше на нём PATCH отвечал 403, галочка в матрице
  // отскакивала обратно, и выглядело это как «матрица не работает».
  return target.companyId === viewer.companyId || target.companyId === null;
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
