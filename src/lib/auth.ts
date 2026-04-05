// src/lib/auth.ts
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const SESSION_COOKIE = "flowerops_session";
const SESSION_DAYS = 365; // 🔥 ИЗМЕНЕНО: Теперь сессия живет 1 год (было 7 дней)

// ── JWT ───────────────────────────────────────────────────
export async function signToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

// ── Session ───────────────────────────────────────────────
export async function createSession(userId: string) {
  const token = await signToken({ userId, role: "OPERATOR" });
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);

  await prisma.session.create({
    data: { userId, token, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    maxAge: SESSION_DAYS * 86400, // 🔥 ДОБАВЛЕНО: Айфоны лучше понимают maxAge
    path: "/",
  });

  return token;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    cookieStore.delete(SESSION_COOKIE);
  }
}

export async function getSession(req?: NextRequest) {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(SESSION_COOKIE)?.value;
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE)?.value;
  }

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true, role: true, firstName: true, lastName: true, avatarUrl: true } } },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.user;
}

// ── Auth code ─────────────────────────────────────────────
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function saveAuthCode(rawEmail: string): Promise<string> {
  const email = rawEmail.toLowerCase().trim();

  let user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" }
  });

  if (!user) {
    user = await prisma.user.create({ data: { email } });
  }

  await prisma.authCode.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000); 

  await prisma.authCode.create({
    data: { userId: user.id, code, expiresAt },
  });

  return code;
}

export async function verifyAuthCode(rawEmail: string, code: string) {
  const email = rawEmail.toLowerCase().trim();

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "asc" }
  });

  if (!user) return null;

  const authCode = await prisma.authCode.findFirst({
    where: {
      userId: user.id,
      code,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!authCode) return null;

  await prisma.authCode.update({
    where: { id: authCode.id },
    data: { used: true },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return user;
}