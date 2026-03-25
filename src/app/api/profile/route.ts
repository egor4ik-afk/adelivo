// src/app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName:  z.string().max(50).optional(),
  phone:     z.string().max(20).optional(),
  homeAddress: z.string().max(200).optional(), // 🔥 Добавили валидацию адреса
  
  // Настройки уведомлений
  notifyNewOrder:  z.boolean().optional(),
  notifyStatus:    z.boolean().optional(),
  notifyCourier:   z.boolean().optional(),
  notifyAddress:   z.boolean().optional(),
  notifyTime:      z.boolean().optional(),
  notifyComment:   z.boolean().optional(),
  notifyOpComment: z.boolean().optional(),
  notifyItems:     z.boolean().optional(),
});

// GET /api/profile
export async function GET(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, email: true, role: true,
      firstName: true, lastName: true, phone: true,
      lastLoginAt: true, createdAt: true,
      notifyNewOrder: true, notifyStatus: true, notifyCourier: true,
      notifyAddress: true, notifyTime: true, notifyComment: true,
      notifyOpComment: true, notifyItems: true,
    },
  });

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // 🔥 Подтягиваем адрес из таблицы Courier
  let homeAddress = "";
  if (profile.email) {
    const courier = await prisma.courier.findFirst({ where: { email: profile.email } });
    homeAddress = courier?.homeAddress || "";
  }

  // Склеиваем и отдаем на клиент
  return NextResponse.json({ ...profile, homeAddress });
}

// PATCH /api/profile
export async function PATCH(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    
    // 🔥 Отделяем homeAddress от остальных данных, так как они лежат в разных таблицах
    const { homeAddress, ...userData } = updateSchema.parse(body);

    // 1. Обновляем таблицу User
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: userData,
      select: {
        id: true, email: true, role: true,
        firstName: true, lastName: true, phone: true,
        notifyNewOrder: true, notifyStatus: true, notifyCourier: true,
        notifyAddress: true, notifyTime: true, notifyComment: true,
        notifyOpComment: true, notifyItems: true,
      },
    });

    // 2. Обновляем таблицу Courier (сохраняем адрес и дублируем телефон для надежности)
    if (user.email && (homeAddress !== undefined || userData.phone !== undefined)) {
      const courierData: { homeAddress?: string; phone?: string } = {};
      if (homeAddress !== undefined) courierData.homeAddress = homeAddress;
      if (userData.phone !== undefined) courierData.phone = userData.phone;

      await prisma.courier.updateMany({
        where: { email: user.email },
        data: courierData
      });
    }

    return NextResponse.json({ ...updated, homeAddress });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}