// src/app/api/orders/[id]/cost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

const COST_MAP: Record<number, number> = {
  500: 732, 600: 838, 900: 1157, 1000: 1264, 1300: 1583, 1400: 1689,
};

function calcCostPrice(price: number): number | null {
  if (COST_MAP[price] !== undefined) return COST_MAP[price];
  if (COST_MAP[price - 100] !== undefined) return COST_MAP[price - 100];
  return null;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "OPERATOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || !order.price) return NextResponse.json({ error: "Заказ не найден или без цены" }, { status: 400 });

    const costPrice = calcCostPrice(order.price);
    if (!costPrice) return NextResponse.json({ error: "Нет в таблице" }, { status: 400 });

    // 1. Обновляем в CRM
    const params = new URLSearchParams();
    params.append("apiKey", CRM_KEY!);
    params.append("order", JSON.stringify({ delivery: { netCost: costPrice } }));
    params.append("by", "id");

    await axios.post(`${CRM_URL}/api/v5/orders/${order.crmId}/edit`, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 5000
    });

    // 2. 🔥 Сохраняем "у себя" в базу
    await prisma.order.update({
      where: { id: order.id },
      data: { costPrice: costPrice }
    });

    return NextResponse.json({ success: true, costPrice });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}