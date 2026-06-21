// src/app/api/manager/orders/[id]/status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateCrmOrder, mapCrmStatus } from "@/lib/crm";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { crmStatus } = await req.json();

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || !order.crmId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let localStatus = mapCrmStatus(crmStatus);

    // 🔥 ЗАЩИТА 1: Статус "Назначен" не сбрасывается на "Новый", если есть курьер
    if (localStatus === "NEW" && order.courierId !== null) {
      localStatus = "ASSIGNED";
    }

    const updateData: any = { crmStatus, status: localStatus, changedAt: new Date() };

    // 🔥 ЗАЩИТА 2: Убираем нестыковки по времени при откате статуса (вернули в сборку)
    if (localStatus === "NEW" || localStatus === "ASSIGNED") {
      updateData.pickedUpAt = null;
      updateData.deliveredAt = null;
      updateData.eta = null;
    }
    
    // Ставим время забора только если его не было
    if (localStatus === "IN_DELIVERY" && order.status !== "IN_DELIVERY" && !order.pickedUpAt) {
      updateData.pickedUpAt = new Date();
    }

    // 🔥 ЗАЩИТА 3: Выкидываем из маршрута при отмене/возврате
    if (localStatus === "CANCELLED" || localStatus === "RETURNED") {
      updateData.routeId = null;
      updateData.routeOrder = null;
      updateData.eta = null;
      updateData.pickedUpAt = null;
      
      if (order.routeId) {
         const siblingsCount = await prisma.order.count({ where: { routeId: order.routeId, id: { not: id } }});
         if (siblingsCount === 0) await prisma.route.deleteMany({ where: { id: order.routeId } });
      }
    }

    await prisma.order.update({ where: { id }, data: updateData });
    await updateCrmOrder(order.crmId, { crmStatus });

    return NextResponse.json({ success: true, localStatus, crmStatus });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}