// src/app/api/konsol/check-status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getKonsolTask } from "@/lib/konsol";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pendingTasks = await prisma.konsolTask.findMany({ where: { status: "DRAFT" } });
    let updatedCount = 0;

    for (const task of pendingTasks) {
      if (!task.konsolTaskId) continue;
      const remote = await getKonsolTask(task.konsolTaskId);
      
      if (remote && remote.state) {
        if (["confirmed", "submitted", "accepted"].includes(remote.state.code)) {
          await prisma.konsolTask.update({ where: { id: task.id }, data: { status: "CONFIRMED" } });
          updatedCount++;
        }
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
    
    // Достаем все задания за неделю
    const tasks = await prisma.konsolTask.findMany({
      where: { 
        date: { gte: new Date(weekStart), lte: new Date(weekEnd + "T23:59:59.999Z") } 
      },
      orderBy: { id: "asc" } 
    });

    const statuses: Record<number, Array<{ label: string, color: string }>> = {};

    for (const t of tasks) {
      if (!statuses[t.courierId]) statuses[t.courierId] = [];
      let currentBadge = null;

      if (t.status === "SIGNED_BY_US") {
        currentBadge = { label: "✅ Оплачено", color: "#10b981" };
      } else {
        const remote = await getKonsolTask(t.konsolTaskId);
        if (remote && remote.state) {
          const code = remote.state.code;
          const title = remote.state.title;
          
          if (code === "submitted") currentBadge = { label: "🟡 Ожидает курьера", color: "#f59e0b" };
          else if (code === "confirmed") currentBadge = { label: "🔵 В работе", color: "#4a7aff" };
          else if (code === "accepted") currentBadge = { label: "🟢 Выполнено", color: "#10b981" };
          else currentBadge = { label: `⏳ ${title}`, color: "#6b6860" };

          // Синхронизация статуса DRAFT -> CONFIRMED, если курьер уже взаимодействовал с заданием
          if (["confirmed", "submitted", "accepted"].includes(code) && t.status === "DRAFT") {
            await prisma.konsolTask.update({ where: { id: t.id }, data: { status: "CONFIRMED" } });
          }
        } else {
          currentBadge = { label: "⏳ Черновик", color: "#6b6860" };
        }
      }

      // Добавляем бейджик, только если такого же текста еще нет (чтобы не дублировать "Оплачено")
      if (currentBadge && !statuses[t.courierId].some(s => s.label === currentBadge?.label)) {
        statuses[t.courierId].push(currentBadge);
      }
    }

    // 🔥 ЧИСТКА: Если у курьера есть активное задание (Черновик, В работе и т.д.), 
    // скрываем статус "✅ Оплачено" от прошлых заданий этой недели, чтобы не захламлять экран.
    for (const courierId in statuses) {
      if (statuses[courierId].length > 1) {
        statuses[courierId] = statuses[courierId].filter(s => s.label !== "✅ Оплачено");
      }
    }

    return NextResponse.json({ success: true, statuses });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}