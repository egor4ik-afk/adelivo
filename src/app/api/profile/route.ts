import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName:  z.string().max(50).optional(),
  phone:     z.string().max(20).optional(),
});

// GET /api/profile — текущий пользователь
export async function GET(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, role: true,
      firstName: true, lastName: true, phone: true,
      lastLoginAt: true, createdAt: true,
    },
  });

  return NextResponse.json(profile);
}

// PATCH /api/profile — обновить профиль
export async function PATCH(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data = updateSchema.parse(body);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data,
    select: {
      id: true, email: true, role: true,
      firstName: true, lastName: true, phone: true,
    },
  });

  return NextResponse.json(updated);
}