// src/app/api/couriers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 🔥 Говорим Next.js НИКОГДА не кэшировать этот запрос (всегда свежие данные)
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const dateStr = twoWeeksAgo.toISOString().split('T')[0];

    const couriers = await prisma.courier.findMany({
      include: {
        shifts: {
          where: { date: { gte: dateStr } },
          take: 1 // Достаточно знать, что хоть одна смена была
        },
        payments: true,
        routes: true,
      },
      orderBy: { fullName: "asc" },
    });

    // 🔥 ГЕОЛОКАЦИЯ: Скрываем координаты, если они старше 60 минут (1 часа)
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();

    const processedCouriers = couriers.map(c => {
      if (c.locationUpdatedAt && (now - new Date(c.locationUpdatedAt).getTime() > ONE_HOUR_MS)) {
        return { ...c, lat: null, lng: null }; 
      }
      return c;
    });

    return NextResponse.json(processedCouriers);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
