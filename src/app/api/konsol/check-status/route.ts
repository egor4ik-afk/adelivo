// src/app/api/konsol/check-status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getKonsolTask, autopayKonsolAct } from "@/lib/konsol";

export const dynamic = "force-dynamic";

// Получить акт из Консоли по actId
async function getKonsolAct(actId: string) {
  const res = await fetch(`https://api.konsol.pro/v2/acts/${actId}`, {
    headers: {
      "Authorization": `Bearer ${process.env.KONSOL_API_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function GET() {
  try {
    const pendingTasks = await prisma.konsolTask.findMany({ where: { status: "DRAFT" } });
    let updatedCount = 0;

    for (const task of pendingTasks) {
      if (!task.konsolTaskId) continue;
      const remote = await getKonsolTask(task.konsolTaskId);

      if (remote?.state) {
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

    const tasks = await prisma.konsolTask.findMany({
      where: {
        date: { gte: new Date(weekStart), lte: new Date(weekEnd + "T23:59:59.999Z") }
      },
      orderBy: { id: "asc" }
    });

    const statuses: Record<number, Array<{ label: string; color: string }>> = {};
    let autopaiedCount = 0;

    for (const t of tasks) {
      if (!statuses[t.courierId]) statuses[t.courierId] = [];
      let currentBadge = null;

      if (t.status === "SIGNED_BY_US") {
        // 🔥 Проверяем реальный статус оплаты акта в Консоли
        if (t.konsolActId) {
          const act = await getKonsolAct(t.konsolActId);

          if (act?.payment?.status === "paid") {
            // Всё хорошо — реально оплачено
            currentBadge = { label: "✅ Оплачено", color: "#10b981" };
          } else if (act?.payment?.status === "not_paid" || act?.payment?.status === "pending") {
            // Акт подписан но оплата не прошла — пытаемся повторить autopay
            console.log(`[check-status] Акт ${t.konsolActId} не оплачен (${act?.payment?.status}), повторяем autopay...`);
            try {
              await autopayKonsolAct(t.konsolActId);
              autopaiedCount++;
              currentBadge = { label: "⏳ Ожидает оплаты", color: "#f59e0b" };
              console.log(`[check-status] Autopay для акта ${t.konsolActId} запущен повторно`);
            } catch (err: any) {
              // Скорее всего нет денег — показываем честный статус
              console.error(`[check-status] Autopay для акта ${t.konsolActId} снова не прошёл:`, err.message);
              currentBadge = { label: "💳 Нет денег", color: "#d94040" };
            }
          } else if (act?.payment?.status === "error") {
            currentBadge = { label: "❌ Ошибка оплаты", color: "#d94040" };
          } else {
            // Акт не найден или статус неизвестен — показываем как оплачено (мы подписали)
            currentBadge = { label: "✅ Оплачено", color: "#10b981" };
          }
        } else {
          currentBadge = { label: "✅ Оплачено", color: "#10b981" };
        }
      } else {
        const remote = await getKonsolTask(t.konsolTaskId);
        if (remote?.state) {
          const code = remote.state.code;
          const title = remote.state.title;

          if (code === "submitted") currentBadge = { label: "🟡 Ожидает курьера", color: "#f59e0b" };
          else if (code === "confirmed") currentBadge = { label: "🔵 В работе", color: "#4a7aff" };
          else if (code === "accepted") currentBadge = { label: "🟢 Выполнено", color: "#10b981" };
          else currentBadge = { label: `⏳ ${title}`, color: "#6b6860" };

          if (["confirmed", "submitted", "accepted"].includes(code) && t.status === "DRAFT") {
            await prisma.konsolTask.update({ where: { id: t.id }, data: { status: "CONFIRMED" } });
          }
        } else {
          currentBadge = { label: "⏳ Черновик", color: "#6b6860" };
        }
      }

      if (currentBadge && !statuses[t.courierId].some(s => s.label === currentBadge?.label)) {
        statuses[t.courierId].push(currentBadge);
      }
    }

    // Чистка: скрываем "Оплачено" если есть другие активные задания
    for (const courierId in statuses) {
      if (statuses[courierId].length > 1) {
        statuses[courierId] = statuses[courierId].filter(s => s.label !== "✅ Оплачено");
      }
    }

    return NextResponse.json({ success: true, statuses, autopaied: autopaiedCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}