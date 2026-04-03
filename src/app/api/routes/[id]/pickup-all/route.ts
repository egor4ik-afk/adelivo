// src/app/api/routes/[id]/pickup-all/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder } from "@/lib/crm";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    
    // Находим все заказы в маршруте, которые еще "Назначены" или "Новые"
    const orders = await prisma.order.findMany({
      where: { routeId: id, status: { in: ["NEW", "ASSIGNED"] } }
    });

    const now = new Date();

    // Обновляем каждый заказ по очереди, чтобы триггерить CRM
    for (const order of orders) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "IN_DELIVERY", pickedUpAt: now, changedAt: now }
      });
      
      if (order.crmId) {
         await updateCrmOrder(order.crmId, { status: "IN_DELIVERY" });
      }
    }

    return NextResponse.json({ success: true, updatedCount: orders.length });
  } catch (error) {
    console.error("POST pickup-all error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}