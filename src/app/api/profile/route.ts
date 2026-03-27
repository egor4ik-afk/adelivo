// src/app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { geocodeAddress } from "@/lib/crm";

const updateSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().max(50).optional(),
  phone: z.string().max(20).optional(),
  homeAddress: z.string().max(200).optional(), // 🔥 Добавили валидацию адреса

  // Настройки уведомлений (ОСТАВЛЕНЫ БЕЗ ИЗМЕНЕНИЙ)
  notifyNewOrder: z.boolean().optional(),
  notifyStatus: z.boolean().optional(),
  notifyCourier: z.boolean().optional(),
  notifyAddress: z.boolean().optional(),
  notifyTime: z.boolean().optional(),
  notifyComment: z.boolean().optional(),
  notifyOpComment: z.boolean().optional(),
  notifyItems: z.boolean().optional(),
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

  let homeAddress = "";
  
  if (profile.email) {
    const courier = await prisma.courier.findFirst({ where: { email: profile.email } });
    if (courier) {
      homeAddress = courier.homeAddress || "";
      
      // 🔥 ЕСЛИ ЭТО КУРЬЕР: берем личные данные из таблицы Courier, если в User пусто
      if (profile.role === "COURIER") {
        profile.firstName = profile.firstName || courier.firstName || null;
        profile.lastName = profile.lastName || courier.lastName || null;
        profile.phone = profile.phone || courier.phone || null;
      }
    }
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

    // 🔥 Отделяем homeAddress от остальных данных
    const { homeAddress, ...userData } = updateSchema.parse(body);

    // 1. Обновляем таблицу User (едино для всех)
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

    // 2. Обновляем таблицу Courier
    if (user.email) {
      // Собираем данные для обновления курьера
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const courierData: any = {};
      
      if (homeAddress !== undefined) courierData.homeAddress = homeAddress;
      if (userData.phone !== undefined) courierData.phone = userData.phone;

      // 🔥 ЕСЛИ ЭТО КУРЬЕР: дополнительно обновляем имя, фамилию и склеиваем fullName
      if (user.role === "COURIER") {
        if (userData.firstName !== undefined) courierData.firstName = userData.firstName;
        if (userData.lastName !== undefined) courierData.lastName = userData.lastName;
        
        // Чтобы в админке поиск по курьерам работал корректно
        if (userData.firstName !== undefined || userData.lastName !== undefined) {
          const existing = await prisma.courier.findFirst({ where: { email: user.email } });
          const fn = userData.firstName !== undefined ? userData.firstName : (existing?.firstName || "");
          const ln = userData.lastName !== undefined ? userData.lastName : (existing?.lastName || "");
          courierData.fullName = `${fn} ${ln}`.trim();
        }
      }

      if (Object.keys(courierData).length > 0) {
        await prisma.courier.updateMany({
          where: { email: user.email },
          data: courierData
        });
        
        // Геокодируем адрес, если он был передан
        if (homeAddress) {
          try {
            const geo = await geocodeAddress(homeAddress);
            if (geo?.lat && geo?.lng) {
              await prisma.courier.updateMany({
                where: { email: user.email },
                data: { homeLat: geo.lat, homeLng: geo.lng }
              });
            }
          } catch (_) {
            // Геокодирование не критично — не блокируем ответ
          }
        }
      }
    }

    return NextResponse.json({ ...updated, homeAddress });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}