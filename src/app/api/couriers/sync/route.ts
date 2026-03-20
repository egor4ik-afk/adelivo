// src/app/api/couriers/sync/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import axios from "axios";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

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
      const fullName = fullNameParts.length > 0 ? fullNameParts.join(" ") : `Курьер ID ${c.id}`;
      
      const phone = c.phone?.number || null;
      
      await prisma.courier.upsert({
        where: { id: c.id },
        update: { 
          firstName: c.firstName || null,
          lastName: c.lastName || null,
          patronymic: c.patronymic || null,
          fullName, 
          phone,
          email: c.email || null,
          description: c.description || null,
          isActive: c.active !== false
        },
        create: { 
          id: c.id, 
          firstName: c.firstName || null,
          lastName: c.lastName || null,
          patronymic: c.patronymic || null,
          fullName, 
          phone,
          email: c.email || null,
          description: c.description || null,
          isActive: c.active !== false
        },
      });
      
      synced++;
    }

    return NextResponse.json({ ok: true, synced, message: `Успешно загружено ${synced} курьеров` });
    
  } catch (e) {
    console.error("Courier sync error:", String(e));
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}