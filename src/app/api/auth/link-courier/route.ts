// src/app/api/auth/link-courier/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
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

    // 1. Ищем существующего курьера с таким именем локально
    let courier = await prisma.courier.findFirst({
      where: {
        fullName: {
          equals: fullName,
          mode: 'insensitive' 
        }
      }
    });

    if (courier) {
      // Если курьер найден в БД, просто обновляем его данные
      courier = await prisma.courier.update({
        where: { id: courier.id },
        data: {
          phone: phone,
          email: user.email, 
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          isActive: true
        }
      });
    } else {
      // 2. Если курьера нет локально — создаем его СНАЧАЛА в RetailCRM
      const crmUrl = process.env.RETAILCRM_API_URL;
      const crmKey = process.env.RETAILCRM_API_KEY;
      
      if (!crmUrl || !crmKey) {
        throw new Error("Не настроены ключи RetailCRM (RETAILCRM)");
      }

      // Формируем параметры в формате form-urlencoded, как требует RetailCRM
      const formData = new URLSearchParams();
      formData.append("apiKey", crmKey);
      formData.append("courier[firstName]", firstName.trim());
      formData.append("courier[lastName]", lastName.trim());
      formData.append("courier[active]", "true");
      if (user.email) formData.append("courier[email]", user.email);
      formData.append("courier[phone][number]", phone.replace(/[^\d+]/g, "")); // Отправляем чистый номер

      const crmRes = await fetch(`${crmUrl}/api/v5/reference/couriers/create`, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const crmData = await crmRes.json();

      if (!crmData.success) {
        console.error("Ошибка RetailCRM:", crmData);
        throw new Error(crmData.errorMsg || "Не удалось создать курьера в CRM");
      }

      // 🔥 Берем ID прямо из ответа RetailCRM
      const crmCourierId = crmData.id;

      // 3. Создаем в нашей локальной БД с ID из CRM
      courier = await prisma.courier.create({
        data: {
          id: crmCourierId, 
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName: fullName,
          phone: phone,
          email: user.email,
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