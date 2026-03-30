// src/app/api/orders/[id]/cost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

// Таблица: цена доставки → себестоимость
const COST_MAP: Record<number, number> = {
  500:  732,
  600:  838,
  900:  1157,
  1000: 1264,
  1300: 1583,
  1400: 1689,
};

function calcCostPrice(price: number): number | null {
  // Точное совпадение
  if (COST_MAP[price] !== undefined) return COST_MAP[price];
  // Авто-надбавка (+100) — пробуем базовую цену
  if (COST_MAP[price - 100] !== undefined) return COST_MAP[price - 100];
  return null;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!order.price) return NextResponse.json({ error: "У заказа нет цены" }, { status: 400 });

    const costPrice = calcCostPrice(order.price);
    if (costPrice === null) {
      return NextResponse.json({
        error: `Нет себестоимости для цены ${order.price} ₽. Добавьте в таблицу.`
      }, { status: 400 });
    }

    if (!CRM_URL || !CRM_KEY) {
      return NextResponse.json({ error: "CRM не настроена" }, { status: 500 });
    }

    // Отправляем в кастомное поле CRM "sebestoimost" (или "cost_price" — уточни код поля)
    const orderPayload = {
      customFields: {
        sebestoimost: costPrice,  // 🔥 замени на реальный код поля из CRM
      }
    };

    const params = new URLSearchParams();
    params.append("apiKey", CRM_KEY);
    params.append("order", JSON.stringify(orderPayload));
    params.append("by", "id");

    await axios.post(
      `${CRM_URL}/api/v5/orders/${order.crmId}/edit`,
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000 }
    );

    console.log(`[Cost] Заказ ${order.crmId}: цена ${order.price} → себестоимость ${costPrice}`);

    return NextResponse.json({ success: true, price: order.price, costPrice });
  } catch (e: any) {
    console.error("[Cost] Ошибка:", e?.response?.data ?? e.message);
    return NextResponse.json({ error: String(e?.response?.data?.message ?? e.message) }, { status: 500 });
  }
}