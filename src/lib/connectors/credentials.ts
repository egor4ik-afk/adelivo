// src/lib/connectors/credentials.ts
// Откуда коннектор берёт ключи.
//
// Порядок: сначала настройки магазина из базы, потом переменные окружения.
// Пока Shop.crmKey пуст — всё работает ровно как раньше, на env.
// Это позволяет переехать на настройки из кабинета постепенно, магазин за магазином.

import { prisma } from "@/lib/prisma";
import type { ConnectorCreds, ConnectorType } from "./types";

const ENV_URL = process.env.RETAILCRM_API_URL ?? null;
const ENV_KEY = process.env.RETAILCRM_API_KEY ?? null;
const ENV_KEY_MEURA = process.env.RETAILCRM_API_KEY_MEURA ?? null;

/** Магазины Meura — исторически ходят по отдельному ключу. */
export const MEURA_SLUGS = ["kaktusfiori", "meura-flowers"];

function asRecord(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, string>;
}

/**
 * Ключи для магазина по его slug.
 * Возвращает null, если магазин не настроен и запасного варианта в env нет.
 */
export async function resolveCreds(shopSlug: string): Promise<ConnectorCreds | null> {
  const shop = await prisma.shop.findUnique({
    where: { slug: shopSlug },
    include: { connector: true },
  });

  const type = (shop?.connector?.type ?? shop?.connectorType ?? "RETAILCRM") as ConnectorType;

  // 1. Настройки из кабинета
  if (shop?.connector?.apiKey) {
    return {
      type,
      baseUrl: shop.connector.baseUrl ?? shop.crmUrl ?? ENV_URL,
      apiKey: shop.connector.apiKey,
      fieldMap: asRecord(shop.connector.fieldMap),
      statusMap: asRecord(shop.connector.statusMap),
      sites: [shopSlug],
    };
  }

  // 2. Запасной вариант: переменные окружения (текущее поведение Банча и Meura)
  const isMeura = MEURA_SLUGS.includes(shopSlug);
  const envKey = isMeura ? ENV_KEY_MEURA : ENV_KEY;
  if (ENV_URL && envKey) {
    return {
      type: "RETAILCRM",
      baseUrl: ENV_URL,
      apiKey: envKey,
      fieldMap: null,
      statusMap: null,
      sites: isMeura ? MEURA_SLUGS : [shopSlug],
    };
  }

  return null;
}

/** Магазины, для которых включён коннектор. */
export async function activeShops() {
  return prisma.shop.findMany({
    where: { isActive: true, connector: { isActive: true } },
    include: { connector: true },
    orderBy: { createdAt: "asc" },
  });
}
