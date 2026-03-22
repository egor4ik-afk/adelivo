// src/app/api/auth/verify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, code, secretCode } = await req.json();
    if (!email || !code) return NextResponse.json({ error: "Email и код обязательны" }, { status: 400 });

    const authCode = await prisma.authCode.findFirst({
      where: { user: { email }, code, used: false, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!authCode) return NextResponse.json({ error: "Неверный или просроченный код" }, { status: 400 });

    await prisma.authCode.update({ where: { id: authCode.id }, data: { used: true } });
    let user = authCode.user;

    // Апгрейд до оператора при наличии секретного кода
    if (secretCode === "0007" && user.role === "COURIER") {
      user = await prisma.user.update({
        where: { id: user.id }, data: { role: "OPERATOR" }
      });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const sessionToken = await signToken({ userId: user.id, role: user.role });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({ data: { token: sessionToken, userId: user.id, expiresAt } });

    // 🔥 ПРОВЕРКА: Привязан ли этот email к курьеру в CRM базе?
    let linked = true;
    if (user.role === "COURIER") {
      const courier = await prisma.courier.findFirst({ where: { email: user.email } });
      if (!courier) linked = false;
    }

    const res = NextResponse.json({ ok: true, role: user.role, linked });
    res.cookies.set("flowerops_session", sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });

    return res;
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}