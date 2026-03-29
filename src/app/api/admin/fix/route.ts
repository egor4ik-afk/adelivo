// src/app/api/admin/clean-couriers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const crmUrl = process.env.RETAILCRM_API_URL;
  const crmKey = process.env.RETAILCRM_API_KEY;
  const logs: string[] = [];

  if (!crmUrl || !crmKey) {
    return NextResponse.json({ error: "Нет ключей CRM в .env" }, { status: 500 });
  }

  try {
    // 1. Получаем всех курьеров из CRM
    const crmRes = await fetch(`${crmUrl}/api/v5/reference/couriers?apiKey=${crmKey}&limit=100`);
    const crmData = await crmRes.json();
    const crmCouriers = crmData.couriers || [];

    // 2. Получаем всех курьеров из нашей локальной БД (без проблемного include!)
    const localCouriers = await prisma.courier.findMany();

    let cleanedCrmCount = 0;
    let cleanedLocalCount = 0;

    // 🔥 Функция определения "мусорного" имени
    const isJunkName = (name: string | null) => {
      if (!name) return true;
      const trimmed = name.trim();
      
      // Если состоит только из цифр (например "1", "15", "30")
      if (/^\d+$/.test(trimmed)) return true;
      
      // Если состоит из 1 или 2 символов
      if (trimmed.length <= 2) return true;
      
      return false;
    };

    logs.push("🧹 НАЧИНАЕМ ОЧИСТКУ RETAILCRM...");

    // Очистка в CRM
    for (const crmC of crmCouriers) {
      const justFirstName = (crmC.firstName || "").trim();
      
      if (isJunkName(justFirstName)) {
        logs.push(`CRM ➡️ Скрываем мусорного курьера: ID ${crmC.id} [${justFirstName}]`);
        
        // Отправляем active: false, чтобы он пропал из интерфейса CRM
        const formData = new URLSearchParams();
        formData.append("apiKey", crmKey);
        formData.append("courier", JSON.stringify({ active: false }));

        await fetch(`${crmUrl}/api/v5/reference/couriers/${crmC.id}/edit`, {
          method: "POST",
          body: formData,
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        
        cleanedCrmCount++;
      }
    }

    logs.push("==============================");
    logs.push("🧹 НАЧИНАЕМ ОЧИСТКУ ЛОКАЛЬНОЙ БД...");

    // Очистка в локальной базе
    for (const localC of localCouriers) {
      if (isJunkName(localC.fullName)) {
        
        // 🔥 Считаем заказы явным безопасным запросом!
        const ordersCount = await prisma.order.count({
          where: { courierId: localC.id }
        });

        if (ordersCount === 0) {
          // Если заказов на нем нет — удаляем с корнями
          await prisma.courier.delete({ where: { id: localC.id } });
          logs.push(`БД ➡️ 🗑 Удалили навсегда: ID ${localC.id} [${localC.fullName}]`);
        } else {
          // Если заказы есть (история), просто деактивируем, чтобы не сломать базу
          await prisma.courier.update({ where: { id: localC.id }, data: { isActive: false } });
          logs.push(`БД ➡️ ⏸ Деактивировали (есть заказы): ID ${localC.id} [${localC.fullName}]`);
        }
        
        cleanedLocalCount++;
      }
    }

    logs.push("==============================");
    logs.push(`✅ ГОТОВО! Скрыто в CRM: ${cleanedCrmCount}. Убрано локально: ${cleanedLocalCount}.`);

    return NextResponse.json({ success: true, logs });

  } catch (error: any) {
    console.error("Clean Couriers Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}