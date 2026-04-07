// src/app/api/konsol/tasks/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
      where: dateFilter, // Применяем фильтр!
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