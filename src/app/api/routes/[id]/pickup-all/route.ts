// src/app/api/routes/[id]/pickup-all/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { updateCrmOrder } from "@/lib/crm";
import { applyUniversalEtaShift } from "@/lib/eta";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(req as any);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    
    // Находим все заказы в маршруте, которые еще "В сборке", "Назначены" или "Новые"
    const orders = await prisma.order.findMany({
      where: { routeId: id, status: { in: ["NEW", "ASSIGNED", "ASSEMBLING"] } },
      orderBy: { routeOrder: 'asc' }
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

    // 🔥 Ищем ПЕРВУЮ точку в маршруте (даже если она не первая в массиве)
    const firstOrder = await prisma.order.findFirst({
        where: { routeId: id, routeOrder: 1 }
    });

    // Запускаем Универсальный Триггер только от лица первой точки,
    // чтобы он посчитал задержку выезда с базы и сдвинул весь маршрут.
    if (firstOrder) {
        await applyUniversalEtaShift(firstOrder.id, "IN_DELIVERY");
    }

    return NextResponse.json({ success: true, updatedCount: orders.length });
  } catch (error) {
    console.error("POST pickup-all error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}