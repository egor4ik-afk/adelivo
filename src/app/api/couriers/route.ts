// src/app/api/couriers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const couriers = await prisma.courier.findMany({
      include: { shifts: true, payments: true, routes: true }, // 🔥 Добавили запятую и routes: true
      orderBy: { fullName: "asc" },
    });
    return NextResponse.json(couriers);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}