// src/app/api/courier/my-shifts/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const courier = await prisma.courier.findFirst({ where: { email: user.email } });
    if (!courier) return NextResponse.json([]); // Если не привязан, отдаем пустоту

    const shifts = await prisma.courierShift.findMany({
      where: { courierId: courier.id }
    });
    
    // Возвращаем просто массив дат ['2026-03-22', '2026-03-23', ...]
    return NextResponse.json(shifts.map(s => s.date));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const courier = await prisma.courier.findFirst({ where: { email: user.email } });
    if (!courier) return NextResponse.json({ error: "Курьер не найден" }, { status: 400 });

    const { date, isWorking } = await req.json();

    if (isWorking) {
      await prisma.courierShift.upsert({
        where: { courierId_date: { courierId: courier.id, date } },
        update: {},
        create: { courierId: courier.id, date }
      });
    } else {
      await prisma.courierShift.deleteMany({
        where: { courierId: courier.id, date }
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}