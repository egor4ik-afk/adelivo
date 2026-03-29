// src/app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { geocodeAddress } from "@/lib/crm";
import { findContractorByPhone, inviteContractor } from "@/lib/konsol";

// 🔥 ДОБАВЛЕНО: разрешаем isAuto в схеме валидации Zod
const updateSchema = z.object({
  firstName:      z.string().min(1).max(50).optional(),
  lastName:       z.string().max(50).optional(),
  phone:          z.string().max(20).optional(),
  homeAddress:    z.string().max(200).optional(),
  konsolPhone:    z.string().optional(),
  isAuto:         z.boolean().optional(), // <--- ДОБАВИЛИ СЮДА
  notifyNewOrder: z.boolean().optional(),
  notifyStatus:   z.boolean().optional(),
  notifyCourier:  z.boolean().optional(),
  notifyAddress:  z.boolean().optional(),
  notifyTime:     z.boolean().optional(),
  notifyComment:  z.boolean().optional(),
  notifyOpComment:z.boolean().optional(),
  notifyItems:    z.boolean().optional(),
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
  let konsolPhone: string | null = null;
  let isLinked = false;
  let isAuto = false; // 🔥 ДОБАВЛЕНО

  if (profile.email) {
    const courier = await prisma.courier.findFirst({ where: { email: profile.email } });
    if (courier) {
      homeAddress  = courier.homeAddress || "";
      konsolPhone  = courier.konsolPhone || null;
      isLinked     = !!courier.konsolContractorId;
      isAuto       = courier.isAuto || false; // 🔥 ЧИТАЕМ ИЗ БД

      if (profile.role === "COURIER") {
        profile.firstName = profile.firstName || courier.firstName || null;
        profile.lastName  = profile.lastName  || courier.lastName  || null;
        profile.phone     = profile.phone     || courier.phone     || null;
      }
    }
  }

  return NextResponse.json({ ...profile, homeAddress, konsolPhone, isLinked, isAuto }); // 🔥 ОТДАЕМ НА ФРОНТ
}

// PATCH /api/profile
export async function PATCH(req: NextRequest) {
  const user = await getSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    // Извлекаем isAuto вместе с остальными
    const { homeAddress, konsolPhone, isAuto, ...userData } = updateSchema.parse(body);

    // 1. Обновляем User
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

    // 2. Обновляем Courier
    if (user.email) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const courierData: any = {};

      if (homeAddress !== undefined) courierData.homeAddress = homeAddress;
      if (userData.phone !== undefined) courierData.phone = userData.phone;
      
      // 🔥 ПРАВИЛЬНОЕ СОХРАНЕНИЕ isAuto В courierData
      if (isAuto !== undefined) courierData.isAuto = isAuto; 

      // 🔥 ЛОГИКА КОНСОЛИ
      if (konsolPhone !== undefined) {
        if (konsolPhone === "" || konsolPhone === null) {
          // Отвязка
          courierData.konsolPhone = null;
          courierData.konsolContractorId = null;
        } else {
          // Ищем исполнителя по телефону
          const contractorId = await findContractorByPhone(konsolPhone);

          if (contractorId) {
            // ✅ Уже зарегистрирован — просто привязываем
            courierData.konsolPhone = konsolPhone;
            courierData.konsolContractorId = contractorId;

            if (Object.keys(courierData).length > 0) {
              await prisma.courier.updateMany({ where: { email: user.email }, data: courierData });
            }
            return NextResponse.json({ ...updated, homeAddress, isAuto, linked: true });

          } else {
            // ❌ Не найден — отправляем приглашение
            const courier = await prisma.courier.findFirst({ where: { email: user.email } });
            const fullName = [courier?.lastName, courier?.firstName, courier?.patronymic]
              .filter(Boolean).join(" ") || `${updated.firstName ?? ""} ${updated.lastName ?? ""}`.trim() || "Исполнитель";

            const invite = await inviteContractor(fullName, konsolPhone);

            if (!invite) {
              return NextResponse.json(
                { error: "Не удалось отправить приглашение в Консоль.Про. Проверьте номер телефона." },
                { status: 400 }
              );
            }

            // Сохраняем телефон, contractorId пока null — заполнится после регистрации
            courierData.konsolPhone = konsolPhone;
            courierData.konsolContractorId = null;

            if (Object.keys(courierData).length > 0) {
              await prisma.courier.updateMany({ where: { email: user.email }, data: courierData });
            }

            const onboardingUrl = invite.onboarding_url
              ?? `https://app.konsol.pro/join/${process.env.KONSOL_SCENARIO_ID}`;

            return NextResponse.json({
              ...updated,
              homeAddress,
              isAuto,
              invited: true,
              onboarding_url: onboardingUrl,
              message: "Приглашение отправлено! Проверьте СМС для регистрации.",
            });
          }
        }
      }

      // Имя/фамилия для курьера
      if (user.role === "COURIER") {
        if (userData.firstName !== undefined) courierData.firstName = userData.firstName;
        if (userData.lastName  !== undefined) courierData.lastName  = userData.lastName;

        if (userData.firstName !== undefined || userData.lastName !== undefined) {
          const existing = await prisma.courier.findFirst({ where: { email: user.email } });
          const fn = userData.firstName ?? existing?.firstName ?? "";
          const ln = userData.lastName  ?? existing?.lastName  ?? "";
          courierData.fullName = `${fn} ${ln}`.trim();
        }
      }

      if (Object.keys(courierData).length > 0) {
        await prisma.courier.updateMany({ where: { email: user.email }, data: courierData });

        if (homeAddress) {
          try {
            const geo = await geocodeAddress(homeAddress);
            if (geo?.lat && geo?.lng) {
              await prisma.courier.updateMany({
                where: { email: user.email },
                data: { homeLat: geo.lat, homeLng: geo.lng },
              });
            }
          } catch (_) { /* геокодирование не критично */ }
        }
      }
    }

    return NextResponse.json({ ...updated, homeAddress, isAuto });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}