// src/app/api/company/shops/route.ts
// Магазины компании: создание и настройка подключения.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, type Viewer } from "@/lib/access";
import { testConnector, type ConnectorType } from "@/lib/connectors";
import { geocodeAddress } from "@/lib/crm";
import { grantShopToCompany } from "@/lib/access";

export const dynamic = "force-dynamic";

const TYPES: ConnectorType[] = ["RETAILCRM", "BITRIX24", "ONEC", "WEBHOOK"];

function slugify(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// Явный тип с необязательными полями: иначе при деструктуризации
// const { viewer, error } = ... TypeScript не даст обратиться к viewer.
type Guard = { viewer?: Viewer; error?: NextResponse };

async function requireCompanyAdmin(req: NextRequest): Promise<Guard> {
  const viewer = await getViewer(req);
  if (!viewer) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!viewer.companyId) {
    return { error: NextResponse.json({ error: "Сначала создайте компанию" }, { status: 400 }) };
  }
  if (viewer.role !== "ADMIN" && !viewer.isSuperAdmin) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { viewer };
}

/** POST — создать магазин внутри своей компании. */
export async function POST(req: NextRequest) {
  const { viewer, error } = await requireCompanyAdmin(req);
  if (error || !viewer) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const b = await req.json();
    const name = String(b.name || "").trim();
    if (name.length < 2) return NextResponse.json({ error: "Укажите название магазина" }, { status: 400 });

    const slug = slugify(b.slug || name) || `shop-${Date.now().toString().slice(-6)}`;
    const exists = await prisma.shop.findUnique({ where: { slug } });
    if (exists) return NextResponse.json({ error: `Магазин «${slug}» уже существует` }, { status: 409 });

    const type: ConnectorType = TYPES.includes(b.connectorType) ? b.connectorType : "WEBHOOK";

    const shop = await prisma.shop.create({
      data: {
        name,
        slug,
        companyId: viewer.companyId,
        connectorType: type,
        storeAddress: b.storeAddress?.trim() || null,
        connector: {
          create: {
            type,
            isActive: false,
            // Для своего вебхука сразу выдаём входящий токен
            apiKey: type === "WEBHOOK" ? crypto.randomUUID() : null,
          },
        },
      },
      include: { connector: true },
    });

    // Без этого новый магазин не увидел бы никто, включая создателя:
    // доступ живёт в матрице, а строк для него ещё нет
    const granted = await grantShopToCompany(shop.id, viewer.companyId!);

    return NextResponse.json({ ok: true, shop, granted });
  } catch (e) {
    console.error("[company/shops POST]", e);
    return NextResponse.json({ error: "Не удалось создать магазин" }, { status: 500 });
  }
}

/**
 * PATCH — настройка подключения магазина.
 * { shopId, connectorType, baseUrl, apiKey, test: true }  — проверить, не сохраняя
 * { shopId, connectorType, baseUrl, apiKey }              — сохранить
 * { shopId, isActive }                                     — включить/выключить
 */
export async function PATCH(req: NextRequest) {
  const { viewer, error } = await requireCompanyAdmin(req);
  if (error || !viewer) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const b = await req.json();
    if (!b.shopId) return NextResponse.json({ error: "shopId обязателен" }, { status: 400 });

    const shop = await prisma.shop.findUnique({
      where: { id: b.shopId },
      include: { connector: true },
    });
    if (!shop) return NextResponse.json({ error: "Магазин не найден" }, { status: 404 });
    if (shop.companyId !== viewer.companyId && !viewer.isSuperAdmin) {
      return NextResponse.json({ error: "Это не ваш магазин" }, { status: 403 });
    }

    // ── Проверка подключения без сохранения ──
    if (b.test) {
      const result = await testConnector({
        type: (b.connectorType ?? shop.connectorType ?? "WEBHOOK") as ConnectorType,
        baseUrl: b.baseUrl ?? shop.connector?.baseUrl,
        // если поле ключа пустое — берём сохранённый
        apiKey: b.apiKey || shop.connector?.apiKey,
      });
      return NextResponse.json(result);
    }

    // ── Включение / выключение ──
    if (b.isActive !== undefined) {
      if (!shop.connector) {
        return NextResponse.json({ error: "Сначала настройте подключение" }, { status: 400 });
      }
      await prisma.connector.update({
        where: { shopId: shop.id },
        data: { isActive: !!b.isActive, errorCount: 0, lastError: null },
      });
      return NextResponse.json({ ok: true });
    }

    // ── Сохранение настроек ──
    const type: ConnectorType = TYPES.includes(b.connectorType)
      ? b.connectorType
      : ((shop.connectorType as ConnectorType) ?? "WEBHOOK");

    const baseUrl = b.baseUrl !== undefined ? b.baseUrl?.trim() || null : shop.connector?.baseUrl ?? null;
    // Пустой ключ = «не менять». Иначе нельзя было бы править URL, не вводя ключ заново.
    const apiKey = b.apiKey ? String(b.apiKey).trim() : shop.connector?.apiKey ?? null;

    // Адрес базы — точка, ОТ которой курьер едет к клиенту.
    // Сразу геокодим: без координат маршрут строить не от чего,
    // а требовать от человека вводить широту и долготу руками — плохо.
    const storeAddress =
      b.storeAddress !== undefined ? b.storeAddress?.trim() || null : shop.storeAddress;

    let storeLat = shop.storeLat;
    let storeLng = shop.storeLng;

    if (b.storeAddress !== undefined && storeAddress !== shop.storeAddress) {
      if (storeAddress) {
        const geo = await geocodeAddress(storeAddress, b.city ?? shop.city);
        storeLat = geo?.lat ?? null;
        storeLng = geo?.lng ?? null;
        if (!geo) {
          return NextResponse.json(
            { error: "Адрес базы не найден на карте — уточните его" },
            { status: 400 }
          );
        }
      } else {
        storeLat = null;
        storeLng = null;
      }
    }

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        connectorType: type,
        name: b.name?.trim() || shop.name,
        storeAddress,
        storeLat,
        storeLng,
        ...(b.city !== undefined ? { city: b.city || null } : {}),
      },
    });

    // Коннектор пишем отдельным запросом, а не вложенным create/update:
    // у вложенного create поле type обязательное, и Prisma не принимает
    // объект, собранный по частям, — типы разъезжаются.
    if (shop.connector) {
      await prisma.connector.update({
        where: { shopId: shop.id },
        data: {
          type,
          baseUrl,
          apiKey,
          ...(b.fieldMap !== undefined ? { fieldMap: b.fieldMap } : {}),
          ...(b.statusMap !== undefined ? { statusMap: b.statusMap } : {}),
        },
      });
    } else {
      await prisma.connector.create({
        data: {
          shopId: shop.id,
          type,
          isActive: false,
          baseUrl,
          apiKey,
          ...(b.fieldMap !== undefined ? { fieldMap: b.fieldMap } : {}),
          ...(b.statusMap !== undefined ? { statusMap: b.statusMap } : {}),
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[company/shops PATCH]", e);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}

/** GET — получить список магазинов (супер-админ видит все, остальные — только своей компании) */
export async function GET(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 🔥 Если супер-админ, не ограничиваем по companyId, отдаем все активные магазины
    const whereClause: any = { isActive: true };
    if (!viewer.isSuperAdmin) {
      if (!viewer.companyId) {
        return NextResponse.json([], { status: 200 });
      }
      whereClause.companyId = viewer.companyId;
    }

    const shops = await prisma.shop.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        slug: true,
        storeLat: true,
        storeLng: true,
        storeAddress: true,
        companyId: true, // Полезно видеть, к какой компании относится магазин
      },
      orderBy: {
        name: 'asc'
      }
    });

    return NextResponse.json(shops);
  } catch (e) {
    console.error("[company/shops GET]", e);
    return NextResponse.json({ error: "Не удалось загрузить магазины" }, { status: 500 });
  }
}
