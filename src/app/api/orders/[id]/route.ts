// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder } from "@/lib/crm";
import { OrderStatus } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = params;
    const body = await req.json();

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updateData: any = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.courier !== undefined) {
      updateData.courier = body.courier;
      updateData.courierManual = true;
    }
    if (body.opComment !== undefined) updateData.opComment = body.opComment;

    await prisma.order.update({
      where: { id },
      data: updateData,
    });

    // Обязательно отправляем ВСЕ изменения обратно в CRM!
    await updateCrmOrder(order.crmId, {
      status: body.status as OrderStatus,
      courier: body.courier,
      opComment: body.opComment,
      address: body.address, // Добавили адрес
      deliveryType: order.deliveryType, // Прокидываем тип доставки для курьера
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/orders/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}