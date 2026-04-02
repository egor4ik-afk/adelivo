// src/app/api/couriers/shifts/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // 🔥 priority больше не достаем и не пытаемся сохранить в смену
    const { courierId, date, isWorking, startTime, endTime } = await req.json();

    if (isWorking) {
      await prisma.courierShift.upsert({
        where: { courierId_date: { courierId, date } },
        create: { 
          courierId, 
          date, 
          startTime: startTime ?? "10:00", 
          endTime: endTime ?? "22:00", 
        },
        update: {
          ...(startTime !== undefined && { startTime }),
          ...(endTime !== undefined && { endTime }),
          // 🔥 Убрали ...(priority !== undefined && { priority })
        },
      });
    } else {
      await prisma.courierShift.deleteMany({
        where: { courierId, date },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}