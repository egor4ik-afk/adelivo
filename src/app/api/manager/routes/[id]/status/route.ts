// src/app/api/manager/routes/[id]/status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateCrmOrder, mapCrmStatus } from "@/lib/crm";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { crmStatus } = await req.json();

    const orders = await prisma.order.findMany({ 
      where: { routeId: id, status: { notIn: ['CANCELLED', 'RETURNED'] } } 
    });

    for (const order of orders) {
      let localStatus = mapCrmStatus(crmStatus);

      // Защита: не сбрасываем назначенного курьера
      if (localStatus === "NEW" && order.courierId !== null) {
        localStatus = "ASSIGNED";
      }

      const updateData: any = { crmStatus, status: localStatus, changedAt: new Date() };

      // Защита от нестыковок таймингов
      if (localStatus === "NEW" || localStatus === "ASSIGNED") {
        updateData.pickedUpAt = null;
        updateData.deliveredAt = null;
        updateData.eta = null;
      }
      if (localStatus === "IN_DELIVERY" && order.status !== "IN_DELIVERY" && !order.pickedUpAt) {
        updateData.pickedUpAt = new Date();
      }

      await prisma.order.update({ where: { id: order.id }, data: updateData });
      
      if (order.crmId) {
        await updateCrmOrder(order.crmId, { crmStatus });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}