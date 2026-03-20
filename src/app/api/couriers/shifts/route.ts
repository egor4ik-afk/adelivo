// src/app/api/couriers/shifts/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { courierId, date, isWorking } = await req.json();

    if (isWorking) {
      await prisma.courierShift.upsert({
        where: { courierId_date: { courierId, date } },
        create: { courierId, date },
        update: {},
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