// src/app/api/auth/verify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    // 🔥 Если это новая регистрация или апгрейд прав
    if (secretCode === "0007" && user.role === "COURIER") {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: "OPERATOR" }
      });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({ data: { token: sessionToken, userId: user.id, expiresAt } });

    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set("session_token", sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });

    return res;
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}