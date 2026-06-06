// src/app/api/couriers/payments/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { payments } = await req.json();

    const operations = payments.map((p: any) => 
      prisma.courierPayment.upsert({
        where: { courierId_date: { courierId: p.courierId, date: p.date } },
        create: { 
          courierId: p.courierId, 
          date: p.date,
          amount: p.amount || 0,          // Ровно та сумма, что пришла
          ordersCount: p.ordersCount || 0 // Ровно то количество, что пришло
        },
        update: { 
          amount: p.amount || 0,
          ordersCount: p.ordersCount || 0
        },
      })
    );

    await prisma.$transaction(operations);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Pay Shifts Error]:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}