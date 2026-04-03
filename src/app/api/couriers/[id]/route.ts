// src/app/api/couriers/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(req as any);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const courierId = Number(id);
    const body = await req.json();

    // 🔥 Собираем только те поля, которые были переданы в запросе
    const updateData: any = {};
    if (body.isAuto !== undefined) updateData.isAuto = body.isAuto;
    if (body.priority !== undefined) updateData.priority = Number(body.priority);
    // Сюда можно будет добавлять и другие поля в будущем

    const updatedCourier = await prisma.courier.update({
      where: { id: courierId },
      data: updateData
    });

    return NextResponse.json({ success: true, courier: updatedCourier });
  } catch (error: any) {
    console.error("PATCH /api/couriers/[id] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}