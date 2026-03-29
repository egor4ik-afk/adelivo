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

    const updatedCourier = await prisma.courier.update({
      where: { id: courierId },
      data: { isAuto: body.isAuto }
    });

    return NextResponse.json({ success: true, courier: updatedCourier });
  } catch (error: any) {
    console.error("PATCH /api/couriers/[id] error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}