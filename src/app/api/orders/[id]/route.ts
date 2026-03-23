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

    if (body.status         !== undefined) updateData.status         = body.status;
    if (body.opComment      !== undefined) updateData.opComment      = body.opComment;
    if (body.address        !== undefined) updateData.address        = body.address;
    if (body.recipientPhone !== undefined) updateData.recipientPhone = body.recipientPhone; // 🔥 Сохраняем телефон в БД

    if (body.courier !== undefined) {
      updateData.courier = body.courier || null;
      if (body.courier) {
        const dbCourier = await prisma.courier.findFirst({
          where: { fullName: body.courier },
        });
        updateData.courierId = dbCourier?.id ?? null;
      } else {
        updateData.courierId = null;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.order.update({ where: { id }, data: updateData });
    }

    // 🔥 ИЗМЕНЕНИЕ: Фильтруем статусы перед отправкой в CRM
    let crmStatus = body.status;
    // Если статус "Назначен" или "В пути", мы его в CRM НЕ отправляем
    if (crmStatus === "ASSIGNED" || crmStatus === "IN_DELIVERY") {
      crmStatus = undefined;
    }

    // Вызываем обновление CRM (undefined поля проигнорируются)
    await updateCrmOrder(order.crmId, {
      status:         crmStatus as OrderStatus | undefined,
      courier:        body.courier,
      opComment:      body.opComment,
      address:        body.address,
      recipientPhone: body.recipientPhone, // 🔥 Отправляем телефон в CRM
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/orders/[id] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}