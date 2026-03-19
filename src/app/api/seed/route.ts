import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 5 тестовых заказов с реальными координатами
const ORDERS = [
  { id: "test-1", ext: "ORD-101", addr: "г. Москва, ул. Тверская, 7", lat: 55.7583, lng: 37.6108, from: "10:00", to: "12:00", cur: "Иванов А.", items: "Розы красные 15 шт." },
  { id: "test-2", ext: "ORD-102", addr: "г. Москва, Ленинский проспект, 45", lat: 55.7056, lng: 37.5732, from: "12:00", to: "14:00", cur: "Петров В.", items: "Тюльпаны 21 шт." },
  { id: "test-3", ext: "ORD-103", addr: "г. Москва, ул. Арбат, 10", lat: 55.7516, lng: 37.5954, from: "14:00", to: "16:00", cur: "Смирнов Д.", items: "Пионы 9 шт." },
  { id: "test-4", ext: "ORD-104", addr: "г. Москва, проспект Мира, 119", lat: 55.8304, lng: 37.6321, from: "16:00", to: "18:00", cur: "Иванов А.", items: "Сборный букет" },
  { id: "test-5", ext: "ORD-105", addr: "г. Москва, Ильменский проезд 14к3", lat: 55.8598, lng: 37.5451, from: "20:00", to: "22:00", cur: "Шульга Сергей", items: "Гвоздика розовая 40 шт., Подъезд 2" }
];

export async function GET() {
  try {
    for (const o of ORDERS) {
      await prisma.order.upsert({
        where: { crmId: o.id },
        update: {},
        create: {
          crmId: o.id,
          externalId: o.ext,
          status: "NEW",
          address: o.addr,
          courier: o.cur,
          price: Math.floor(Math.random() * 2000) + 1500,
          slotFrom: o.from,
          slotTo: o.to,
          slotRaw: `с ${o.from} до ${o.to}`,
          items: o.items,
          lat: o.lat,
          lng: o.lng,
          crmCreatedAt: new Date(),
        },
      });
    }
    return NextResponse.json({ success: true, message: "✅ 5 точек успешно добавлены! Откройте дашборд." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}