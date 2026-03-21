// src/app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName:  z.string().max(50).optional(),
  phone:     z.string().max(20).optional(),
  
  // Добавили валидацию для настроек уведомлений
  notifyNewOrder:  z.boolean().optional(),
  notifyStatus:    z.boolean().optional(),
  notifyCourier:   z.boolean().optional(),
  notifyAddress:   z.boolean().optional(),
  notifyTime:      z.boolean().optional(),
  notifyComment:   z.boolean().optional(),
  notifyOpComment: z.boolean().optional(),
  notifyItems:     z.boolean().optional(),
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
      // Возвращаем настройки
      notifyNewOrder: true, notifyStatus: true, notifyCourier: true,
      notifyAddress: true, notifyTime: true, notifyComment: true,
      notifyOpComment: true, notifyItems: true,
    },
  });

  return NextResponse.json(profile);
}

// PATCH /api/profile — обновить профиль
export async function PATCH(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = updateSchema.parse(body);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true, email: true, role: true,
        firstName: true, lastName: true, phone: true,
        notifyNewOrder: true, notifyStatus: true, notifyCourier: true,
        notifyAddress: true, notifyTime: true, notifyComment: true,
        notifyOpComment: true, notifyItems: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}