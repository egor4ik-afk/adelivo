// src/app/api/courier/my-shifts/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const user = await getSession(req as any);
    if (!user || user.role !== "COURIER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const courier = await prisma.courier.findFirst({ where: { email: user.email } });
    if (!courier) return NextResponse.json({ error: "Courier not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    // Отдаем смены, но НЕ отдаем приоритет (хотя он не секретный, лучше просто скрыть)
    const shifts = await prisma.courierShift.findMany({
      where: {
        courierId: courier.id,
        ...(fromDate && toDate ? { date: { gte: fromDate, lte: toDate } } : {})
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        // 🔥 priority: true - НЕ ОТДАЕМ на фронт курьеру
      }
    });

    return NextResponse.json(shifts);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession(req as any);
    if (!user || user.role !== "COURIER") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const courier = await prisma.courier.findFirst({ where: { email: user.email } });
    if (!courier) return NextResponse.json({ error: "Courier not found" }, { status: 404 });

    const { date, isWorking, startTime, endTime } = await req.json();

    if (isWorking) {
      await prisma.courierShift.upsert({
        where: { courierId_date: { courierId: courier.id, date } },
        create: { 
          courierId: courier.id, 
          date, 
          startTime: startTime || "10:00", 
          endTime: endTime || "22:00",
        },
        update: {
          ...(startTime !== undefined && { startTime }),
          ...(endTime !== undefined && { endTime }),
          // 🔥 priority ЗДЕСЬ НЕТ. Курьер не может обновить свой приоритет
        }
      });
    } else {
      await prisma.courierShift.deleteMany({
        where: { courierId: courier.id, date }
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}