// src/app/api/admin/fetch-konsol-phones/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import axios from "axios";

export async function GET() {
  const KONSOL_API_KEY = process.env.KONSOL_API_KEY;
  
  if (!KONSOL_API_KEY) {
    return NextResponse.json({ error: "Нет ключа KONSOL_API_KEY в .env" }, { status: 500 });
  }

  try {
    const logs: string[] = [];

    // 1. Ищем курьеров, которым нужен телефон Консоли
    const couriersToFix = await prisma.courier.findMany({
      where: {
        konsolContractorId: { not: null },
        OR: [
          { konsolPhone: null },
          { konsolPhone: "" }
        ]
      }
    });

    if (couriersToFix.length === 0) {
       return NextResponse.json({ success: true, logs: ["✅ Нет курьеров для исправления."] });
    }

    logs.push(`🔍 Нужно найти телефоны для: ${couriersToFix.length} курьеров.`);
    
    // 2. Скачиваем список ВСЕХ исполнителей из Консоли (проходим по страницам)
    let allContractors: any[] = [];
    
    try {
      logs.push(`⏳ Скачиваем базу исполнителей из Консоль.Про...`);
      // Пробегаем до 5 страниц (если у тебя много исполнителей, можно увеличить до 10)
      for (let page = 1; page <= 5; page++) {
        const res = await axios.get(`https://api.konsol.pro/v2/contractors?page=${page}&limit=100`, {
          headers: { 
            "Authorization": `Bearer ${KONSOL_API_KEY}`,
            "Content-Type": "application/json"
          }
        });

        // В Консоли данные обычно лежат в data или contractors
        const list = res.data?.data || res.data?.contractors || (Array.isArray(res.data) ? res.data : []);
        
        if (!list || list.length === 0) break; // Страницы кончились
        
        allContractors = [...allContractors, ...list];
      }
      logs.push(`📦 Всего загружено исполнителей из Консоли: ${allContractors.length}`);
    } catch (err: any) {
      logs.push(`❌ Ошибка загрузки списка: ${err?.response?.data?.message || err.message}`);
      return NextResponse.json({ success: false, logs }, { status: 500 });
    }

    // 3. Сопоставляем и сохраняем
    let fixedCount = 0;

    for (const courier of couriersToFix) {
      // Ищем исполнителя в загруженном массиве по ID (приводим к строке для надежности)
      const contractor = allContractors.find(c => String(c.id) === String(courier.konsolContractorId));

      if (contractor && contractor.phone) {
        // Нашли! Сохраняем телефон в нашу БД
        await prisma.courier.update({
          where: { id: courier.id },
          data: { konsolPhone: contractor.phone }
        });
        
        logs.push(`✅ ${courier.fullName}: найден телефон ➡️ ${contractor.phone}`);
        fixedCount++;
      } else {
        logs.push(`⚠️ ${courier.fullName}: ID ${courier.konsolContractorId} не найден в общем списке Консоли или там не указан телефон.`);
      }
    }

    logs.push(`=============================`);
    logs.push(`🎯 ГОТОВО! Успешно привязано телефонов: ${fixedCount} из ${couriersToFix.length}`);

    return NextResponse.json({ success: true, logs });
  } catch (error: any) {
    console.error("Fetch Konsol Phones Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}