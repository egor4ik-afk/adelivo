// src/app/api/auth/link-courier/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { courierId, phone } = await req.json();
    if (!courierId || !phone) {
      return NextResponse.json({ error: "Необходимо выбрать профиль и указать телефон" }, { status: 400 });
    }

    // 1. Сохраняем телефон в аккаунт User
    await prisma.user.update({
      where: { id: user.id },
      data: { phone }
    });

    // 2. Привязываем email курьера в базе CRM (и обновляем телефон там же)
    await prisma.courier.update({
      where: { id: Number(courierId) },
      data: { email: user.email, phone }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}