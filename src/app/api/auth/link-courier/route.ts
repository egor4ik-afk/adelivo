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

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    // 🔥 1. СТАНДАРТ: Всегда формируем полное имя как "Фамилия Имя"
    const standardFullName = `${cleanLastName} ${cleanFirstName}`;

    // 🔥 2. УМНЫЙ ПОИСК: Ищем курьера по частям имени (в любом порядке)
    const nameParts = [cleanFirstName, cleanLastName].filter(Boolean);
    
    let courier = await prisma.courier.findFirst({
      where: {
        AND: nameParts.map(part => ({
          fullName: { contains: part, mode: 'insensitive' }
        }))
      }
    });

    if (courier) {
      // Если курьер найден в БД, обновляем его данные и приводим fullName к стандарту
      courier = await prisma.courier.update({
        where: { id: courier.id },
        data: {
          phone: phone,
          email: user.email, 
          firstName: cleanFirstName,
          lastName: cleanLastName,
          fullName: standardFullName, // Перезаписываем в правильном порядке
          isActive: true
        }
      });
    } else {
      // 3. Если курьера нет локально — создаем его СНАЧАЛА в RetailCRM
      const crmUrl = process.env.RETAILCRM_API_URL;
      const crmKey = process.env.RETAILCRM_API_KEY;
      
      if (!crmUrl || !crmKey) {
        throw new Error("Не настроены ключи RetailCRM (RETAILCRM_API_URL, RETAILCRM_API_KEY)");
      }

      // Собираем объект курьера в формате, который ждет CRM (отдельно Имя и Фамилия)
      const courierPayload = {
        firstName: cleanFirstName,
        lastName: cleanLastName,
        active: true,
        email: user.email ? user.email : undefined,
        phone: {
          number: phone.replace(/[^\d+]/g, "") // Оставляем только цифры и плюс
        }
      };

      // Упаковываем в URLSearchParams (ключ + сериализованный JSON)
      const formData = new URLSearchParams();
      formData.append("apiKey", crmKey);
      formData.append("courier", JSON.stringify(courierPayload));

      // Отправляем запрос
      const crmRes = await fetch(`${crmUrl}/api/v5/reference/couriers/create`, {
        method: "POST",
        body: formData,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      const crmData = await crmRes.json();
      
      // Логируем ответ для контроля
      console.log("ОТВЕТ ОТ RETAILCRM (КУРЬЕРЫ):", JSON.stringify(crmData, null, 2));

      if (!crmData.success) {
        throw new Error(`Ошибка CRM: ${crmData.errorMsg} ` + JSON.stringify(crmData.errors || {}));
      }

      // Берем ID прямо из ответа RetailCRM
      const crmCourierId = crmData.id;

      // 4. Создаем в нашей локальной БД с ID из CRM
      courier = await prisma.courier.create({
        data: {
          id: crmCourierId, 
          firstName: cleanFirstName,
          lastName: cleanLastName,
          fullName: standardFullName, // Сразу сохраняем по стандарту "Фамилия Имя"
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