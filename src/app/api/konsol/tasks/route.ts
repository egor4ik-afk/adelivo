// src/app/api/konsol/tasks/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getViewer, accessibleCourierIds } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 🔥 1. Получаем даты из запроса
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    // Выплаты — чувствительные данные: суммы, задания, статусы актов.
    // Отдаём только по своим курьерам.
    const viewer = await getViewer(req as never);
    const courierIds = viewer ? await accessibleCourierIds(viewer) : [];
    const courierFilter = courierIds === null ? {} : { courierId: { in: courierIds } };

    // 🔥 2. Формируем жесткий фильтр по датам
    let dateFilter = {};
    if (start && end) {
      dateFilter = {
        date: {
          gte: new Date(start),
          lte: new Date(end + "T23:59:59.999Z"),
        }
      };
    }

    const tasks = await prisma.konsolTask.findMany({
      where: { ...dateFilter, ...courierFilter },
      include: {
        courier: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            konsolContractorId: true,
          }
        }
      },
      orderBy: [{ date: "desc" }, { courierId: "asc" }]
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}