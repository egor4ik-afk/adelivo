// src/app/api/couriers/sync/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

// 🔥 Фильтр мусорных имен из CRM
const BAD_WORDS = ["сдэк", "яндекс", "доставк", "курьер", "тест", "пеший", "авто", "logisty", "dostavista"];

export async function GET() {
  if (!CRM_URL || !CRM_KEY) {
    return NextResponse.json({ error: "No CRM config" }, { status: 500 });
  }

  try {
    const res = await axios.get(`${CRM_URL}/api/v5/reference/couriers`, {
      params: { apiKey: CRM_KEY },
    });

    const couriersObj = res.data?.couriers || {};
    const couriers = Array.isArray(couriersObj) ? couriersObj : Object.values(couriersObj);

    let synced = 0;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of couriers as any[]) {
      // Собираем полное имя
      const fullNameParts = [c.firstName, c.patronymic, c.lastName].filter(Boolean);
      const fullName = fullNameParts.length > 0 ? fullNameParts.join(" ") : "";
      
      // 1. ОТСЕВ: Если имени нет или оно короче 3 символов — пропускаем
      if (!fullName || fullName.trim().length < 3) continue;

      // 2. ОТСЕВ: Если имя содержит мусорное слово — пропускаем
      const lowerName = fullName.toLowerCase();
      if (BAD_WORDS.some(word => lowerName.includes(word))) continue;

      const crmPhone = c.phone?.number || null;

      // Проверяем, есть ли уже этот курьер в нашей базе
      const existing = await prisma.courier.findUnique({ where: { id: c.id } });

      await prisma.courier.upsert({
        where: { id: c.id },
        update: { 
          firstName: c.firstName || null,
          lastName: c.lastName || null,
          patronymic: c.patronymic || null,
          fullName, 
          description: c.description || null,
          isActive: c.active !== false,
          // 🔥 ВАЖНО: Обновляем почту и телефон из CRM ТОЛЬКО если у нас в базе они пустые. 
          // Если курьер уже ввел свой реальный номер при регистрации - не затираем его!
          ...(existing?.email ? {} : { email: c.email || null }),
          ...(existing?.phone ? {} : { phone: crmPhone }),
        },
        create: { 
          id: c.id, 
          firstName: c.firstName || null,
          lastName: c.lastName || null,
          patronymic: c.patronymic || null,
          fullName, 
          phone: crmPhone,
          email: c.email || null,
          description: c.description || null,
          isActive: c.active !== false
        },
      });
      
      synced++;
    }

    return NextResponse.json({ ok: true, synced, message: `Успешно загружено ${synced} реальных курьеров` });
    
  } catch (e) {
    console.error("Courier sync error:", String(e));
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}