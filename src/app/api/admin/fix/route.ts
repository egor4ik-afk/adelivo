// src/app/api/admin/debug-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const KONSOL_API_KEY = process.env.KONSOL_API_KEY;
  const KONSOL_BUS = "https://api.konsol.pro/bus/alpha";

  if (!KONSOL_API_KEY) {
    return NextResponse.json({ error: "Нет ключа KONSOL_API_KEY" }, { status: 500 });
  }

  const headers = {
    "Authorization": `Bearer ${KONSOL_API_KEY}`,
    "Content-Type": "application/json",
  };

  const today = new Date();
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayStr = monday.toISOString().split("T")[0];
  const sundayStr = sunday.toISOString().split("T")[0];

  // 1. Все задания без фильтра (первые 20)
  const resAll = await axios.get(`${KONSOL_BUS}/workflow/tasks?per_page=20`, { headers });
  const allTasks = resAll.data?.data || resAll.data || [];

  // 2. Задания с фильтром по неделе
  const resWeek = await axios.get(
    `${KONSOL_BUS}/workflow/tasks?per_page=100&since_date_from=${mondayStr}&since_date_to=${sundayStr}`,
    { headers }
  );
  const weekTasks = resWeek.data?.data || resWeek.data || [];

  // 3. Наши курьеры с konsolContractorId
  const couriers = await prisma.courier.findMany({
    where: { konsolContractorId: { not: null } },
    select: { id: true, fullName: true, konsolContractorId: true },
  });

  // 4. Анализ — находим ли курьера по contractor.id
  const analysis = Array.isArray(allTasks)
    ? allTasks.map((t: any) => ({
        task_id: t.id,
        state: t.state?.code,
        since_date: t.since_date,
        contractor_id: t.contractor?.id,
        matched: couriers.find(c => c.konsolContractorId === String(t.contractor?.id))?.fullName ?? "❌ НЕ НАЙДЕН",
      }))
    : [];

  return NextResponse.json({
    week: `${mondayStr} — ${sundayStr}`,

    // Первые 2 задания сырьём — смотрим структуру
    raw_sample: Array.isArray(allTasks) ? allTasks.slice(0, 2) : allTasks,

    // Анализ сопоставления всех 20
    analysis,

    // Результат фильтра по неделе
    week_filter_count: Array.isArray(weekTasks) ? weekTasks.length : 0,
    week_filter_tasks: Array.isArray(weekTasks)
      ? weekTasks.map((t: any) => ({
          id: t.id,
          state: t.state?.code,
          since_date: t.since_date,
          contractor_id: t.contractor?.id,
          matched: couriers.find(c => c.konsolContractorId === String(t.contractor?.id))?.fullName ?? "❌ НЕ НАЙДЕН",
        }))
      : [],

    // Наши курьеры в БД
    our_couriers: couriers,
  });
}