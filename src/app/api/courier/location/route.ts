// src/app/api/courier/location/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth"; // 🔥 Берем твою проверенную функцию
import { z } from "zod";

// Валидируем, что координаты — это обязательно числа
const locationSchema = z.object({
  lat: z.number({ required_error: "Широта обязательна", invalid_type_error: "Широта должна быть числом" }),
  lng: z.number({ required_error: "Долгота обязательна", invalid_type_error: "Долгота должна быть числом" }),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Используем getSession! Она сама найдет куку flowerops_session и проверит её
    const userAuth = await getSession(req);
    
    // Если сессии нет или у пользователя нет email (а для курьера он обязателен)
    if (!userAuth || !userAuth.email) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Пробуем получить тело запроса
    const body = await req.json();

    // 2. Проверяем координаты
    const validationResult = locationSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: "Неверный формат координат" }, { status: 400 });
    }

    const { lat, lng } = validationResult.data;

    // 3. Ищем курьера по email из надежной сессии
    const courier = await prisma.courier.findFirst({ 
      where: { email: userAuth.email } 
    });
    
    if (!courier) {
      return NextResponse.json({ error: "Курьер не найден" }, { status: 404 });
    }

    // 4. Постоянно обновляем локацию в БД
    await prisma.courier.update({ 
      where: { id: courier.id }, 
      data: { lat, lng } 
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Ошибка обновления локации:", e);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}