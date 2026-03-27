// src/app/api/auth/link-courier/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth"; // 🔥 ИСПРАВЛЕН ИМПОРТ

export async function POST(request: Request) {
  try {
    // 🔥 Берем сессию (cookie читаются автоматически внутри getSession)
    const user = await getSession(); 
    if (!user || user.role !== "COURIER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { firstName, lastName, phone } = await request.json();

    if (!firstName || !lastName || !phone) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    // Собираем полное имя
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    // 1. Ищем существующего курьера с таким именем (без учета регистра)
    let courier = await prisma.courier.findFirst({
      where: {
        fullName: {
          equals: fullName,
          mode: 'insensitive' // поиск не зависит от больших/маленьких букв
        }
      }
    });

    if (courier) {
      // Если курьер найден в БД, обновляем его данные
      // 🔥 Связь с аккаунтом идет ТОЛЬКО через email
      courier = await prisma.courier.update({
        where: { id: courier.id },
        data: {
          phone: phone,
          email: user.email, // Система по email поймет, что это его профиль
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          isActive: true
        }
      });
    } else {
      // 2. Если курьера нет в БД, создаем нового
      // Так как id в таблице Courier не autoincrement, генерируем случайный (например, 9xxxxx)
      const generateId = Math.floor(Math.random() * 100000) + 900000;
      
      courier = await prisma.courier.create({
        data: {
          id: generateId, // 🔥 Назначаем сгенерированный ID
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName: fullName,
          phone: phone,
          email: user.email, // Привязка к аккаунту
          isActive: true,
        }
      });
    }

    return NextResponse.json({ success: true, courierId: courier.id });
    
  } catch (error: any) {
    console.error("Link courier error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}