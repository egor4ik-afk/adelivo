// src/app/api/auth/verify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email: rawEmail, code } = await req.json();
    if (!rawEmail || !code) return NextResponse.json({ error: "Email и код обязательны" }, { status: 400 });

    const email = rawEmail.toLowerCase().trim();

    const authCode = await prisma.authCode.findFirst({
      where: { 
        user: { email: { equals: email, mode: "insensitive" } }, 
        code, 
        used: false, 
        expiresAt: { gt: new Date() } 
      },
      include: { user: true },
      orderBy: { createdAt: "desc" }
    });

    if (!authCode) return NextResponse.json({ error: "Неверный или просроченный код" }, { status: 400 });

    await prisma.authCode.update({ where: { id: authCode.id }, data: { used: true } });
    const user = authCode.user;

    // Обновляем время входа
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const sessionToken = await signToken({ userId: user.id, role: user.role });
    
    const expiresInDays = 365;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    await prisma.session.create({ data: { token: sessionToken, userId: user.id, expiresAt } });

    let linked = true;
    if (user.role === "COURIER") {
      const courier = await prisma.courier.findFirst({ 
        where: { email: { equals: user.email, mode: "insensitive" } } 
      });
      if (!courier) linked = false;
    }

    const res = NextResponse.json({ ok: true, role: user.role, linked });
    
    res.cookies.set("flowerops_session", sessionToken, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production", 
      sameSite: "lax", 
      path: "/", 
      expires: expiresAt,
      maxAge: expiresInDays * 24 * 60 * 60
    });

    return res;
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}