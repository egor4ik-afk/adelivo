// src/app/api/konsol/check-status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getKonsolTask } from "@/lib/konsol";

export const dynamic = "force-dynamic";

// ✅ 1. Метод GET (Для кнопки "Проверить статусы")
export async function GET() {
  try {
    const pendingTasks = await prisma.konsolTask.findMany({
      where: { status: "DRAFT" }
    });

    let updatedCount = 0;

    for (const task of pendingTasks) {
      if (!task.konsolTaskId) continue;
      const remote = await getKonsolTask(task.konsolTaskId);
      
      if (remote && remote.state) {
        if (["confirmed", "submitted", "accepted"].includes(remote.state.code)) {
          await prisma.konsolTask.update({
            where: { id: task.id },
            data: { status: "CONFIRMED" }
          });
          updatedCount++;
        }
      }
    }
    return NextResponse.json({ success: true, updated: updatedCount });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// ✅ 2. Метод POST (Для таблицы смен на фронтенде)
export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { weekStart, weekEnd } = await req.json(); // YYYY-MM-DD
    
    console.log(`\n=== [POST] Запрос статусов с ${weekStart} по ${weekEnd} ===`);

    // Ищем все задания Консоли в нашей базе за выбранную неделю
    const tasks = await prisma.konsolTask.findMany({
      where: { 
        date: { 
          gte: new Date(weekStart), 
          lte: new Date(weekEnd + "T23:59:59.999Z") // Охватываем весь последний день
        } 
      }
    });

    console.log(`[POST] Найдено заданий в нашей БД за этот период: ${tasks.length}`);

    const statuses: Record<number, { label: string, color: string }> = {};

    for (const t of tasks) {
      console.log(`[POST] Проверяем задание БД ID: ${t.id}, Курьер: ${t.courierId}, KonsolTaskID: ${t.konsolTaskId}`);
      
      if (t.status === "SIGNED_BY_US") {
        statuses[t.courierId] = { label: "✅ Подписан нами", color: "#10b981" };
        continue;
      }
      
      const remote = await getKonsolTask(t.konsolTaskId);
      
      if (remote && remote.state) {
        const code = remote.state.code;
        const title = remote.state.title;
        console.log(`[POST] Консоль ответила для ${t.konsolTaskId} -> code: ${code}, title: ${title}`);
        
        // Обновляем бейджики для фронта
        if (code === "submitted") statuses[t.courierId] = { label: "🟡 Ожидает курьера", color: "#f59e0b" };
        else if (code === "confirmed") statuses[t.courierId] = { label: "🔵 Принято курьером", color: "#4a7aff" };
        else if (code === "accepted") statuses[t.courierId] = { label: "🟢 Выполнено", color: "#10b981" };
        else statuses[t.courierId] = { label: `⏳ ${title}`, color: "#6b6860" };

        // 🔥 СИНХРОНИЗАЦИЯ С БАЗОЙ:
        // Если в Консоли статус активный (submitted, confirmed или accepted), а у нас всё еще DRAFT - обновляем!
        if (["confirmed", "submitted", "accepted"].includes(code) && t.status === "DRAFT") {
          console.log(`[POST] ⚡ Обновляю статус в БД для задания ${t.id} с DRAFT на CONFIRMED`);
          await prisma.konsolTask.update({
            where: { id: t.id },
            data: { status: "CONFIRMED" }
          });
        }
      } else {
        console.log(`[POST] ❌ Не удалось получить данные из Консоли для ${t.konsolTaskId}`);
        statuses[t.courierId] = { label: "⏳ Черновик", color: "#6b6860" };
      }
    }

    console.log("=== [POST] Завершено ===\n");
    return NextResponse.json({ success: true, statuses });
  } catch (error: any) {
    console.error("[POST] Ошибка:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}