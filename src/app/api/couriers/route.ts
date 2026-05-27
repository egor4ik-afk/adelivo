// src/app/api/couriers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch shifts in a ±4 week window so navigation works in both directions
    const from = new Date();
    from.setDate(from.getDate() - 28);
    const to = new Date();
    to.setDate(to.getDate() + 28);

    const fromStr = from.toISOString().split("T")[0];
    const toStr   = to.toISOString().split("T")[0];

    const couriers = await prisma.courier.findMany({
      include: {
        shifts: {
          where: { date: { gte: fromStr, lte: toStr } },
          // ❌ NO take: 1 — we need all shifts in range
        },
        payments: true,
        routes: true,
      },
      orderBy: { fullName: "asc" },
    });

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const now = Date.now();

    const processedCouriers = couriers.map(c => {
      if (
        c.locationUpdatedAt &&
        now - new Date(c.locationUpdatedAt).getTime() > ONE_HOUR_MS
      ) {
        return { ...c, lat: null, lng: null };
      }
      return c;
    });

    return NextResponse.json(processedCouriers);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}