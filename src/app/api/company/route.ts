// src/app/api/company/route.ts
// Профиль компании: чтение, создание, обновление.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/access";

export const dynamic = "force-dynamic";

const RESERVED = new Set([
  "admin", "manager", "courier", "couriers", "dashboard", "login", "api",
  "about", "keysy", "integracii", "vozmozhnosti", "company", "join",
  "orders", "design", "pochemu-my", "stat-kurerom", "sistema-upravleniya-kurerami",
  "ai-marshrutizaciya",
]);

function slugify(raw: string) {
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",
    м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",
    щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  };
  return raw
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** GET — компания текущего пользователя вместе с магазинами и коннекторами. */
export async function GET(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!viewer.companyId) {
    return NextResponse.json({ company: null, shops: [], canCreate: viewer.role === "ADMIN" || viewer.isSuperAdmin });
  }

  const company = await prisma.company.findUnique({
    where: { id: viewer.companyId },
    include: {
      shops: {
        include: { connector: true, _count: { select: { orders: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { users: true } },
    },
  });

  if (!company) {
    return NextResponse.json({ company: null, shops: [], canCreate: true });
  }

  // Ключи наружу не отдаём — только признак, что они заполнены
  const shops = company.shops.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    isActive: s.isActive,
    connectorType: s.connectorType,
    storeAddress: s.storeAddress,
    ordersCount: s._count.orders,
    connector: s.connector
      ? {
          type: s.connector.type,
          isActive: s.connector.isActive,
          baseUrl: s.connector.baseUrl,
          hasKey: !!s.connector.apiKey,
          lastSyncAt: s.connector.lastSyncAt,
          lastError: s.connector.lastError,
        }
      : null,
  }));

  return NextResponse.json({
    company: {
      id: company.id,
      slug: company.slug,
      name: company.name,
      phone: company.phone,
      email: company.email,
      inviteEnabled: company.inviteEnabled,
      inviteToken: company.inviteToken,
      usersCount: company._count.users,
    },
    shops,
    isAdmin: viewer.role === "ADMIN" || viewer.isSuperAdmin,
  });
}

/** POST — создать компанию. Создатель становится её админом. */
export async function POST(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer.companyId) {
    return NextResponse.json({ error: "Вы уже состоите в компании" }, { status: 400 });
  }

  try {
    const b = await req.json();
    const name = String(b.name || "").trim();
    if (name.length < 2) {
      return NextResponse.json({ error: "Укажите название компании" }, { status: 400 });
    }

    let slug = slugify(b.slug || name);
    if (!slug) return NextResponse.json({ error: "Не удалось составить адрес из названия" }, { status: 400 });
    if (RESERVED.has(slug)) {
      return NextResponse.json({ error: `Адрес «${slug}» зарезервирован, выберите другой` }, { status: 400 });
    }

    const taken = await prisma.company.findUnique({ where: { slug } });
    if (taken) {
      return NextResponse.json({ error: `Адрес «${slug}» уже занят` }, { status: 409 });
    }

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        phone: b.phone?.trim() || null,
        email: b.email?.trim() || viewer.email,
      },
    });

    // Создатель — админ своей компании
    await prisma.user.update({
      where: { id: viewer.id },
      data: { companyId: company.id, role: "ADMIN" },
    });

    return NextResponse.json({ ok: true, company });
  } catch (e) {
    console.error("[company POST]", e);
    return NextResponse.json({ error: "Не удалось создать компанию" }, { status: 500 });
  }
}

/** PATCH — реквизиты компании и управление ссылкой-приглашением. */
export async function PATCH(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!viewer.companyId) return NextResponse.json({ error: "Компания не найдена" }, { status: 404 });
  if (viewer.role !== "ADMIN" && !viewer.isSuperAdmin) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const b = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};

    if (b.name !== undefined) data.name = String(b.name).trim();
    if (b.phone !== undefined) data.phone = b.phone?.trim() || null;
    if (b.email !== undefined) data.email = b.email?.trim() || null;
    if (b.inviteEnabled !== undefined) data.inviteEnabled = !!b.inviteEnabled;

    // Перевыпуск ссылки-приглашения: старая перестаёт работать сразу
    if (b.regenerateInvite) {
      data.inviteToken = crypto.randomUUID();
    }

    const company = await prisma.company.update({
      where: { id: viewer.companyId },
      data,
    });

    return NextResponse.json({ ok: true, company });
  } catch (e) {
    console.error("[company PATCH]", e);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
