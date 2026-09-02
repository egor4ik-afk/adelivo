// src/app/api/company/telegram/route.ts
// Чаты Telegram, из которых компания принимает заказы.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/access";

export const dynamic = "force-dynamic";

async function requireCompanyAdmin(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!viewer.companyId) return { error: NextResponse.json({ error: "Сначала создайте компанию" }, { status: 400 }) };
  if (viewer.role !== "ADMIN" && !viewer.isSuperAdmin) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { viewer };
}

export async function GET(req: NextRequest) {
  const { viewer, error } = await requireCompanyAdmin(req);
  if (error || !viewer) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sources = await prisma.telegramSource.findMany({
    where: { companyId: viewer.companyId! },
    include: { shop: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ sources });
}

/** POST — подключить чат. */
export async function POST(req: NextRequest) {
  const { viewer, error } = await requireCompanyAdmin(req);
  if (error || !viewer) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const b = await req.json();
    const chatId = String(b.chatId || "").trim();
    if (!chatId) return NextResponse.json({ error: "Укажите ID чата" }, { status: 400 });
    if (!b.shopId) return NextResponse.json({ error: "Выберите магазин" }, { status: 400 });

    // Магазин должен быть свой — иначе чужие заказы поедут к вам
    const shop = await prisma.shop.findFirst({
      where: { id: b.shopId, companyId: viewer.companyId! },
      select: { id: true },
    });
    if (!shop) return NextResponse.json({ error: "Магазин не найден" }, { status: 404 });

    const exists = await prisma.telegramSource.findUnique({ where: { chatId } });
    if (exists) {
      return NextResponse.json(
        { error: "Этот чат уже подключён — возможно, к другой компании" },
        { status: 409 }
      );
    }

    const source = await prisma.telegramSource.create({
      data: {
        chatId,
        title: b.title?.trim() || null,
        companyId: viewer.companyId!,
        shopId: shop.id,
        autoCreate: !!b.autoCreate,
        hintTemplate: b.hintTemplate?.trim() || null,
      },
      include: { shop: { select: { id: true, name: true, slug: true } } },
    });

    return NextResponse.json({ ok: true, source });
  } catch (e) {
    console.error("[company/telegram POST]", e);
    return NextResponse.json({ error: "Не удалось подключить чат" }, { status: 500 });
  }
}

/** PATCH — изменить настройки чата. DELETE — отключить. */
export async function PATCH(req: NextRequest) {
  const { viewer, error } = await requireCompanyAdmin(req);
  if (error || !viewer) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const b = await req.json();
    const source = await prisma.telegramSource.findFirst({
      where: { id: b.id, companyId: viewer.companyId! },
    });
    if (!source) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (b.title !== undefined) data.title = b.title?.trim() || null;
    if (b.isActive !== undefined) data.isActive = !!b.isActive;
    if (b.autoCreate !== undefined) data.autoCreate = !!b.autoCreate;
    if (b.hintTemplate !== undefined) data.hintTemplate = b.hintTemplate?.trim() || null;
    if (b.shopId) {
      const shop = await prisma.shop.findFirst({
        where: { id: b.shopId, companyId: viewer.companyId! },
        select: { id: true },
      });
      if (!shop) return NextResponse.json({ error: "Магазин не найден" }, { status: 404 });
      data.shopId = shop.id;
    }

    await prisma.telegramSource.update({ where: { id: source.id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[company/telegram PATCH]", e);
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { viewer, error } = await requireCompanyAdmin(req);
  if (error || !viewer) return error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

  await prisma.telegramSource.deleteMany({ where: { id, companyId: viewer.companyId! } });
  return NextResponse.json({ ok: true });
}
