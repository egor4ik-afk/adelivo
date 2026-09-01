// src/app/api/couriers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, courierScope } from "@/lib/access";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Раньше эндпоинт работал вообще без авторизации и отдавал всех курьеров
    // всем подряд — с телефонами, координатами и выплатами
    const viewer = await getViewer(req);
    if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Fetch shifts in a ±4 week window so navigation works in both directions
    const from = new Date();
    from.setDate(from.getDate() - 28);
    const to = new Date();
    to.setDate(to.getDate() + 28);

    const fromStr = from.toISOString().split("T")[0];
    const toStr   = to.toISOString().split("T")[0];

    const couriers = await prisma.courier.findMany({
      where: await courierScope(viewer),
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