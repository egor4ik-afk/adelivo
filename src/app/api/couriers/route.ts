// src/app/api/couriers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 🔥 Говорим Next.js НИКОГДА не кэшировать этот запрос (всегда свежие данные)
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const couriers = await prisma.courier.findMany({
      include: { shifts: true, payments: true, routes: true },
      orderBy: { fullName: "asc" },
    });

    // 🔥 ГЕОЛОКАЦИЯ: Скрываем координаты, если они старше 10 минут
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const now = Date.now();

    const processedCouriers = couriers.map(c => {
      // Prisma возвращает даты как объекты Date, поэтому можно сразу брать getTime()
      if (c.locationUpdatedAt && (now - new Date(c.locationUpdatedAt).getTime() > TEN_MINUTES_MS)) {
        return { ...c, lat: null, lng: null }; 
      }
      return c;
    });

    return NextResponse.json(processedCouriers);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}