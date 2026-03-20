// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder } from "@/lib/crm";
import { OrderStatus } from "@prisma/client";

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const body = await req.json();

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.courier !== undefined) {
      updateData.courier = body.courier;
      updateData.courierManual = true;
      
      // 🔥 Находим ID этого курьера в нашей базе и тоже записываем
      if (body.courier) {
        const dbCourier = await prisma.courier.findFirst({
          where: { fullName: body.courier }
        });
        if (dbCourier) updateData.courierId = dbCourier.id;
      } else {
        updateData.courierId = null;
      }
    }
    if (body.opComment !== undefined) updateData.opComment = body.opComment;

    await prisma.order.update({
      where: { id },
      data: updateData,
    });

    await updateCrmOrder(order.crmId, {
      status: body.status as OrderStatus,
      courier: body.courier,
      opComment: body.opComment,
      address: body.address, 
      deliveryType: order.deliveryType, 
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/orders/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}