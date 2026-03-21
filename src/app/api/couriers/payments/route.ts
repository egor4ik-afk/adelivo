// src/app/api/couriers/payments/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // 1. Получаем массив оплат из тела запроса
    const { payments } = await req.json();

    // 2. Массово сохраняем в новую таблицу CourierPayment
    const operations = payments.map((p: { courierId: number, date: string }) => 
      prisma.courierPayment.upsert({
        where: { courierId_date: { courierId: p.courierId, date: p.date } },
        create: { courierId: p.courierId, date: p.date },
        update: {}, // Если уже есть, ничего не меняем
      })
    );

    await prisma.$transaction(operations);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Pay Shifts Error]:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}