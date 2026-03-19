// src/app/api/seed/route.ts
import { NextResponse } from "next/server";
import { upsertOrder } from "@/lib/crm";

const ORDERS = [
  {
    id: 1001,
    number: "ORD-101",
    status: "new",
    customerComment: "Подъезд 2, домофон 374, этаж 5. Позвоните за 15 минут.",
    delivery: {
      time: "с 10:00 до 12:00",
      cost: 1500,
      address: { text: "г. Москва, ул. Тверская, 7" },
      service: { name: "Иванов А." },
    },
    items: [{ productName: "Розы красные", quantity: 15 }],
  },
  {
    id: 1002,
    number: "ORD-102",
    status: "new",
    customerComment: "Оставить у двери, код домофона 1234#",
    delivery: {
      time: "с 12:00 до 14:00",
      cost: 2000,
      address: { text: "г. Москва, Ленинский проспект, 45" },
      service: { name: "Петров В." },
    },
    items: [{ productName: "Тюльпаны", quantity: 21 }],
  },
  {
    id: 1003,
    number: "ORD-103",
    status: "new",
    customerComment: "",
    delivery: {
      time: "с 14:00 до 16:00",
      // Кривой адрес — геокодер не найдёт, пометит как невалидный
      address: { text: "Москва, улица Несуществующая, корпус 999, офис 0" },
      service: { name: "Смирнов Д." },
    },
    items: [{ productName: "Пионы", quantity: 9 }],
  },
  {
    id: 1004,
    number: "ORD-104",
    status: "new",
    customerComment: "Это подарок, пожалуйста не звоните в дверь — сюрприз!",
    delivery: {
      time: "с 16:00 до 18:00",
      cost: 1600,
      address: { text: "г. Москва, проспект Мира, 119" },
      service: { name: "Иванов А." },
    },
    items: [{ productName: "Сборный букет", quantity: 1 }],
  },
  {
    id: 1005,
    number: "ORD-105",
    status: "new",
    customerComment: "Подъезд 2 (Репин 2). Домофон: 30665. Этаж 37.",
    delivery: {
      time: "с 20:00 до 22:00",
      cost: 2800,
      address: { text: "г. Москва, Ильменский проезд, д. 14к3, кв. 665" },
      service: { name: "Шульга Сергей" },
    },
    items: [{ productName: "Гвоздика розовая", quantity: 40 }],
  },
];

export async function GET() {
  try {
    // Сначала чистим старые тестовые заказы чтобы пересоздать и получить уведомления
    const { prisma } = await import("@/lib/prisma");
    await prisma.order.deleteMany({
      where: { crmId: { in: ORDERS.map(o => String(o.id)) } },
    });

    for (const o of ORDERS) {
      await upsertOrder(o as any);
    }

    return NextResponse.json({
      ok: true,
      message: `✅ ${ORDERS.length} заказов добавлено. Уведомления отправлены. ORD-103 — кривой адрес.`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}