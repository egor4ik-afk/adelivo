import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { autopayKonsolAct } from "@/lib/konsol";

export const dynamic = "force-dynamic";

const KONSOL_BUS = "https://api.konsol.pro/bus/alpha";
const KONSOL_V2  = "https://api.konsol.pro/v2";
const headers = {
  "Authorization": `Bearer ${process.env.KONSOL_API_KEY}`,
  "Content-Type": "application/json",
};

// Получаем задания из Консоли через filter (POST)
async function fetchKonsolTasksByWeek(mondayStr: string, sundayStr: string) {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/filter`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      state_code: ["submitted", "confirmed", "auto_confirmed", "checked_in", "accepted"],
      since_date: mondayStr,
      to_date: sundayStr,
      pagination: { page: 1, limit: 100 },
    }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data?.collection || [];
}

// Получаем одно задание по ID
async function fetchKonsolTask(taskId: string) {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/filter`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [Number(taskId)], pagination: { page: 1, limit: 1 } }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const collection = data?.collection || [];
  return collection.length > 0 ? collection[0] : null;
}

// Получаем акт из v2
async function fetchKonsolAct(actId: string) {
  const res = await fetch(`${KONSOL_V2}/acts/${actId}`, { headers, cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function GET() {
  try {
    const pendingTasks = await prisma.konsolTask.findMany({ where: { status: "DRAFT" } });
    let updatedCount = 0;

    for (const task of pendingTasks) {
      if (!task.konsolTaskId) continue;
      const remote = await fetchKonsolTask(task.konsolTaskId);
      if (remote?.state?.code && ["confirmed", "submitted", "accepted", "auto_confirmed", "checked_in"].includes(remote.state.code)) {
        await prisma.konsolTask.update({ where: { id: task.id }, data: { status: "CONFIRMED" } });
        updatedCount++;
      }
    }
    return NextResponse.json({ success: true, updated: updatedCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { weekStart, weekEnd } = await req.json();
    const mondayStr = weekStart;
    const sundayStr = weekEnd;

    // ====================================================================
    // 🔥 ШАГ 1: ПОДТЯГИВАЕМ АКТИВНЫЕ ЗАДАНИЯ НЕДЕЛИ ИЗ КОНСОЛИ
    // ====================================================================
    try {
      const aktiveTasks = await fetchKonsolTasksByWeek(mondayStr, sundayStr);

      if (aktiveTasks.length > 0) {
        const couriers = await prisma.courier.findMany({
          where: { konsolContractorId: { not: null } },
        });

        for (const task of aktiveTasks) {
          const rawId = task.contractor?.id;
          if (!rawId) continue;

          const courier = couriers.find(c => c.konsolContractorId === String(rawId));
          if (!courier) continue;

          const duties = task.duties || [];
          const amount = duties.reduce((acc: number, d: any) => acc + Number(d.price) * Number(d.quantity), 0);
          const dateStr = task.since_date;
          if (!dateStr) continue;

          const actsIds = task.acts_ids || task.data?.acts_ids || [];
          const hasActs = actsIds.length > 0;
          const actIdToSave = hasActs ? String(actsIds[0]) : null;

          const existing = await prisma.konsolTask.findFirst({
            where: { konsolTaskId: String(task.id) }
          });

          if (existing) {
            // 🔥 ЗОЛОТОЕ ПРАВИЛО: НИКОГДА НЕ ПОНИЖАЕМ СТАТУС SIGNED_BY_US
            if (existing.status !== "SIGNED_BY_US") {
               const dbStatus = hasActs ? "SIGNED_BY_US" : "CONFIRMED";
               await prisma.konsolTask.update({ 
                 where: { id: existing.id }, 
                 data: { status: dbStatus, konsolActId: actIdToSave || existing.konsolActId } 
               });
            }
          } else {
            const dbStatus = hasActs ? "SIGNED_BY_US" : "CONFIRMED";
            await prisma.konsolTask.upsert({
              where: { courierId_date: { courierId: courier.id, date: new Date(`${dateStr}T00:00:00Z`) } },
              update: { konsolTaskId: String(task.id), amount, status: dbStatus, konsolActId: actIdToSave },
              create: { courierId: courier.id, konsolTaskId: String(task.id), date: new Date(`${dateStr}T00:00:00Z`), amount, status: dbStatus, konsolActId: actIdToSave },
            });
          }
        }
      }
    } catch (syncErr) {
      console.error("[CheckStatus] Ошибка подтягивания заданий:", syncErr);
    }

    // ====================================================================
    // 🔥 ШАГ 2: СБОР СТАТУСОВ ДЛЯ ИНТЕРФЕЙСА
    // ====================================================================
    const tasks = await prisma.konsolTask.findMany({
      where: { date: { gte: new Date(weekStart), lte: new Date(weekEnd + "T23:59:59.999Z") } },
      orderBy: { id: "asc" },
    });

    const statuses: Record<number, Array<{ label: string; color: string }>> = {};
    let autopaiedCount = 0;

    for (let t of tasks) {
      if (!statuses[t.courierId]) statuses[t.courierId] = [];
      let currentBadge = null;

      if (t.konsolTaskId && t.status !== "SIGNED_BY_US") {
         const remote = await fetchKonsolTask(t.konsolTaskId);
         if (remote) {
            const actsIds = remote.acts_ids || remote.data?.acts_ids || [];
            if (actsIds.length > 0) {
               const newActId = String(actsIds[0]);
               await prisma.konsolTask.update({
                  where: { id: t.id },
                  data: { status: "SIGNED_BY_US", konsolActId: newActId }
               });
               t.status = "SIGNED_BY_US"; 
               t.konsolActId = newActId;
            } else if (remote.state) {
               const code = remote.state.code;
               const newDbStatus = ["confirmed", "submitted", "auto_confirmed", "checked_in", "accepted"].includes(code) ? "CONFIRMED" : t.status;
               if (newDbStatus !== t.status) {
                 await prisma.konsolTask.update({ where: { id: t.id }, data: { status: newDbStatus } });
                 t.status = newDbStatus;
               }
            }
         }
      }

      // Отрисовка бейджа 
      if (t.status === "SIGNED_BY_US" && t.konsolActId) {
          const act = await fetchKonsolAct(t.konsolActId);
          if (act?.payment?.status === "paid") {
            currentBadge = { label: "✅ Оплачено", color: "#10b981" };
          } else if (act?.payment?.status === "not_paid" || act?.payment?.status === "pending") {
            try {
              await autopayKonsolAct(t.konsolActId);
              autopaiedCount++;
              currentBadge = { label: "⏳ Ожидает оплаты", color: "#f59e0b" };
            } catch {
              currentBadge = { label: "💳 Нет денег", color: "#d94040" };
            }
          } else if (act?.payment?.status === "error") {
            currentBadge = { label: "❌ Ошибка оплаты", color: "#d94040" };
          } else {
            currentBadge = { label: "✅ Подписано", color: "#10b981" };
          }
      } else if (t.status === "CONFIRMED") {
         currentBadge = { label: "🔵 В работе", color: "#4a7aff" };
      } else {
         currentBadge = { label: "⏳ Черновик", color: "#6b6860" };
      }

      if (currentBadge && !statuses[t.courierId].some(s => s.label === currentBadge?.label)) {
        statuses[t.courierId].push(currentBadge);
      }
    }

    for (const courierId in statuses) {
      if (statuses[courierId].length > 1) {
        statuses[courierId] = statuses[courierId].filter(s => s.label !== "✅ Оплачено" && s.label !== "✅ Подписано");
      }
    }

    return NextResponse.json({ success: true, statuses, autopaied: autopaiedCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}