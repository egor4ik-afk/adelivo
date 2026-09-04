// src/app/api/staff/shifts/route.ts
// График сотрудников офиса: чтение недели и переключение смены.
//
// Отдельно от /api/couriers/shifts намеренно: там смены принадлежат
// Courier из CRM, здесь — учётной записи User. Модели разные, и сводить
// их в один эндпоинт означало бы разветвление по типу внутри каждой строки.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Роли, которые попадают в график. Курьеры живут в своей вкладке. */
const STAFF_ROLES = ["ADMIN", "OPERATOR"] as const;

function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekStart}T00:00:00`);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

/** GET ?weekStart=YYYY-MM-DD — сотрудники и их смены за неделю. */
export async function GET(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer.role === "COURIER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekStart = req.nextUrl.searchParams.get("weekStart");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "Нужен weekStart в формате YYYY-MM-DD" }, { status: 400 });
  }
  const dates = weekDates(weekStart);

  // Глобальный админ видит всех, остальные — свою компанию.
  // Сотрудники без компании видны админам: иначе только что заведённый
  // человек не появлялся бы в графике до привязки.
  const where = viewer.isSuperAdmin
    ? { role: { in: [...STAFF_ROLES] } }
    : {
        role: { in: [...STAFF_ROLES] },
        OR: [{ companyId: viewer.companyId }, { companyId: null }],
      };

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, email: true, role: true,
      firstName: true, lastName: true, avatarUrl: true,
      staffShifts: { where: { date: { in: dates } } },
    },
    orderBy: [{ role: "asc" }, { firstName: "asc" }, { email: "asc" }],
  });

  return NextResponse.json({
    dates,
    canEditOthers: viewer.role === "ADMIN" || viewer.isSuperAdmin,
    viewerId: viewer.id,
    staff: users.map((u) => ({
      id: u.id,
      role: u.role,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      avatarUrl: u.avatarUrl,
      shifts: u.staffShifts.map((s) => ({
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
    })),
  });
}

/** POST — поставить, снять или отредактировать смену. */
export async function POST(req: NextRequest) {
  const viewer = await getViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer.role === "COURIER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const b = await req.json();
  const userId = String(b.userId || "");
  const date = String(b.date || "");
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Нужны userId и date" }, { status: 400 });
  }

  // Оператор ведёт только свой график. Чужие смены — только у админа:
  // иначе любой сотрудник мог бы снять коллегу со смены.
  const canEditOthers = viewer.role === "ADMIN" || viewer.isSuperAdmin;
  if (userId !== viewer.id && !canEditOthers) {
    return NextResponse.json({ error: "Можно менять только свой график" }, { status: 403 });
  }

  if (b.isWorking === false) {
    await prisma.staffShift.deleteMany({ where: { userId, date } });
    return NextResponse.json({ ok: true, removed: true });
  }

  const startTime = b.startTime ? String(b.startTime) : "10:00";
  const endTime = b.endTime ? String(b.endTime) : "22:00";

  const shift = await prisma.staffShift.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, startTime, endTime },
    update: { startTime, endTime },
  });

  return NextResponse.json({ ok: true, shift });
}