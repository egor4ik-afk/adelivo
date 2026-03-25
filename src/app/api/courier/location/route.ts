// src/app/api/courier/location/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { z } from "zod";

const locationSchema = z.object({
  lat: z.number({ required_error: "Широта обязательна", invalid_type_error: "Широта должна быть числом" }),
  lng: z.number({ required_error: "Долгота обязательна", invalid_type_error: "Долгота должна быть числом" }),
});

export async function POST(req: NextRequest) {
  try {
    const userAuth = await getSession(req);
    
    if (!userAuth || !userAuth.email) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await req.json();

    const validationResult = locationSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: "Неверный формат координат" }, { status: 400 });
    }

    const { lat, lng } = validationResult.data;

    const courier = await prisma.courier.findFirst({ 
      where: { email: userAuth.email } 
    });
    
    if (!courier) {
      return NextResponse.json({ error: "Курьер не найден" }, { status: 404 });
    }

    await prisma.courier.update({ 
      where: { id: courier.id }, 
      data: { 
        lat, 
        lng,
        locationUpdatedAt: new Date(),
      } 
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Ошибка обновления локации:", e);
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}