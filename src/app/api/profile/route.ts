// src/app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth"; // Используем твою мощную функцию!
import { z } from "zod";

// Схема валидации (чтобы поля краснели при ошибках)
const updateSchema = z.object({
  firstName: z.string().min(1, "Имя не может быть пустым").max(50, "Слишком длинное имя").optional(),
  lastName:  z.string().max(50, "Слишком длинная фамилия").optional(),
  phone:     z.string().max(20, "Слишком длинный номер телефона").optional(),
  homeAddress: z.string().max(200, "Слишком длинный адрес").optional(),
  
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
  // 1. Используем твой getSession. Он сам разберется с await cookies() и именем flowerops_session
  const userAuth = await getSession(req);
  if (!userAuth) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // 2. Достаем полные данные пользователя (включая настройки и телефон)
  const user = await prisma.user.findUnique({
    where: { id: userAuth.id },
  });
  if (!user) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  // 3. Ищем адрес курьера, если есть email
  let homeAddress = "";
  if (user.email) {
    const courier = await prisma.courier.findFirst({ where: { email: user.email } });
    homeAddress = courier?.homeAddress || "";
  }

  // Отдаем всё вместе
  return NextResponse.json({
    id: user.id, 
    email: user.email, 
    role: user.role,
    firstName: user.firstName, 
    lastName: user.lastName, 
    phone: user.phone,
    notifyNewOrder: user.notifyNewOrder,
    notifyStatus: user.notifyStatus,
    notifyCourier: user.notifyCourier,
    notifyAddress: user.notifyAddress,
    notifyTime: user.notifyTime,
    notifyComment: user.notifyComment,
    notifyOpComment: user.notifyOpComment,
    notifyItems: user.notifyItems,
    homeAddress // Домашний адрес из таблицы курьера
  });
}

// PATCH /api/profile
export async function PATCH(req: NextRequest) {
  try {
    // Снова доверяем авторизацию твоей функции
    const userAuth = await getSession(req);
    if (!userAuth) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const body = await req.json();

    // Безопасная валидация
    const validationResult = updateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: "Ошибка валидации", 
          details: validationResult.error.flatten().fieldErrors 
        }, 
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const { homeAddress, ...userUpdateData } = data;

    // Обновляем модель User (имя, телефон, уведомления)
    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: userAuth.id },
        data: userUpdateData
      });
    }

    // Обновляем модель Courier (телефон и адрес)
    if (userAuth.email) {
      const courierUpdateData: { phone?: string; homeAddress?: string } = {};
      if (data.phone !== undefined) courierUpdateData.phone = data.phone;
      if (data.homeAddress !== undefined) courierUpdateData.homeAddress = data.homeAddress;

      if (Object.keys(courierUpdateData).length > 0) {
        await prisma.courier.updateMany({
          where: { email: userAuth.email },
          data: courierUpdateData
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Profile update error:", e);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}