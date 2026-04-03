// src/app/api/routes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();

    const updatedRoute = await prisma.route.update({
      where: { id },
      data: { baseArrivalTime: body.baseArrivalTime }
    });

    // 💡 Здесь в будущем можно вызывать функцию полного перерасчета маршрута (Яндекс), 
    // так как стартовое время изменилось!

    return NextResponse.json(updatedRoute);
  } catch (error) {
    console.error("PATCH /api/routes/[id] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}