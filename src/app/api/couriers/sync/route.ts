// src/app/api/couriers/sync/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

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

    // 🔥 Только активные из CRM
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeCrmCouriers = (couriers as any[]).filter(c => c.active !== false);
    const activeCrmIds = new Set(activeCrmCouriers.map((c: any) => c.id));

    let synced = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of activeCrmCouriers as any[]) {
      const fullNameParts = [c.firstName, c.patronymic, c.lastName].filter(Boolean);
      const fullName = fullNameParts.length > 0 ? fullNameParts.join(" ") : "";

      if (!fullName || fullName.trim().length < 3) continue;

      const lowerName = fullName.toLowerCase();
      if (BAD_WORDS.some(word => lowerName.includes(word))) continue;

      const crmPhone = c.phone?.number || null;
      const existing = await prisma.courier.findUnique({ where: { id: c.id } });

      await prisma.courier.upsert({
        where: { id: c.id },
        update: {
          firstName: c.firstName || null,
          lastName: c.lastName || null,
          patronymic: c.patronymic || null,
          fullName,
          description: c.description || null,
          isActive: true, // всегда активен — мы уже отфильтровали неактивных выше
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
          isActive: true,
        },
      });

      synced++;
    }

    // 🔥 Деактивируем/удаляем тех кого нет среди активных в CRM
    const dbCouriers = await prisma.courier.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true },
    });

    let deactivated = 0;
    let deleted = 0;

    for (const dbC of dbCouriers) {
      if (activeCrmIds.has(dbC.id)) continue; // есть в CRM — не трогаем

      const [ordersCount, tasksCount] = await Promise.all([
        prisma.order.count({ where: { courierId: dbC.id } }),
        prisma.konsolTask.count({ where: { courierId: dbC.id } }),
      ]);

      if (ordersCount > 0 || tasksCount > 0) {
        await prisma.courier.update({ where: { id: dbC.id }, data: { isActive: false } });
        console.log(`[Sync] Деактивирован: ${dbC.fullName} (ID ${dbC.id})`);
        deactivated++;
      } else {
        await prisma.courier.delete({ where: { id: dbC.id } });
        console.log(`[Sync] Удалён: ${dbC.fullName} (ID ${dbC.id})`);
        deleted++;
      }
    }

    return NextResponse.json({
      ok: true,
      synced,
      deactivated,
      deleted,
      message: `Синхронизировано: ${synced}, деактивировано: ${deactivated}, удалено: ${deleted}`,
    });

  } catch (e) {
    console.error("Courier sync error:", String(e));
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}