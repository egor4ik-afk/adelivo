// src/app/api/orders/bulk-cost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

const COST_MAP: Record<number, number> = {
  500: 732, 600: 838, 900: 1157, 1000: 1264, 1300: 1583, 1400: 1689,
};

export async function POST(req: NextRequest) {
  const user = await getSession(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "OPERATOR")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { ids } = await req.json();
  if (!ids || !ids.length) return NextResponse.json({ error: "No IDs" }, { status: 400 });

  const orders = await prisma.order.findMany({ where: { id: { in: ids } } });
  const results = { success: 0, failed: 0 };

  for (const order of orders) {
    try {
      if (!order.price) continue;
      const costPrice = COST_MAP[order.price] || COST_MAP[order.price - 100];
      if (!costPrice) continue;

      // В CRM
      const params = new URLSearchParams();
      params.append("apiKey", CRM_KEY!);
      params.append("order", JSON.stringify({ delivery: { netCost: costPrice } }));
      params.append("by", "id");
      await axios.post(`${CRM_URL}/api/v5/orders/${order.crmId}/edit`, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 4000
      });

      // В базу
      await prisma.order.update({ where: { id: order.id }, data: { costPrice } });
      results.success++;
    } catch (e) {
      results.failed++;
    }
  }

  return NextResponse.json(results);
}