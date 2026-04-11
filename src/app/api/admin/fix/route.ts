// src/app/api/admin/fix-prices/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcBaseDeliveryPrice } from "@/lib/crm";

export async function GET() {
  try {
    // 1. Ищем только те заказы, где сейчас стоит ошибочная цена и есть координаты
    const orders = await prisma.order.findMany({
      where: {
        wrongPrice: true,
        lat: { not: null },
        lng: { not: null }
      }
    });

    let fixedCount = 0;

    // 2. Проходимся по каждому заказу
    for (const order of orders) {
      const basePrice = calcBaseDeliveryPrice(order.lat!, order.lng!);
      
      let isAuto = false;
      if (order.courierId) {
        const courier = await prisma.courier.findUnique({
          where: { id: order.courierId },
          select: { isAuto: true }
        });
        isAuto = !!courier?.isAuto;
      }

      const crmPrice = order.price ?? 0;
      
      // 3. Применяем новую правильную логику проверки
      // Цена ошибочна ТОЛЬКО если она не равна ни базе, ни базе+100
      const isActuallyWrong = crmPrice > 0 && crmPrice !== basePrice && crmPrice !== (basePrice + 100);

      // 4. Если по новой логике цена ПРАВИЛЬНАЯ — снимаем флаг ошибки
      if (!isActuallyWrong) {
        await prisma.order.update({
          where: { id: order.id },
          data: { wrongPrice: false }
        });
        fixedCount++;
      }
    }

    return NextResponse.json({ 
      success: true,
      message: "Перепроверка завершена", 
      totalChecked: orders.length, 
      fixedCount: fixedCount 
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}