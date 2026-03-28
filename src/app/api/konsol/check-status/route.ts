// src/app/api/konsol/check-status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getKonsolTask } from "@/lib/konsol";

export async function POST(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { weekStart, weekEnd } = await req.json(); // YYYY-MM-DD
    
    // Ищем все задания Консоли в нашей базе за выбранную неделю
    const tasks = await prisma.konsolTask.findMany({
      where: { date: { gte: new Date(weekStart), lte: new Date(weekEnd) } }
    });

    const statuses: Record<number, { label: string, color: string }> = {};

    for (const t of tasks) {
      if (t.status === "SIGNED_BY_US") {
        statuses[t.courierId] = { label: "✅ Подписан нами", color: "#10b981" };
        continue;
      }
      
      const remote = await getKonsolTask(t.konsolTaskId);
      if (remote && remote.state) {
        const code = remote.state.code;
        const title = remote.state.title;
        
        if (code === "submitted") statuses[t.courierId] = { label: "🟡 Ожидает курьера", color: "#f59e0b" };
        else if (code === "confirmed") statuses[t.courierId] = { label: "🔵 Принято курьером", color: "#4a7aff" };
        else if (code === "accepted") statuses[t.courierId] = { label: "🟢 Выполнено", color: "#10b981" };
        else statuses[t.courierId] = { label: `⏳ ${title}`, color: "#6b6860" };
      } else {
        statuses[t.courierId] = { label: "⏳ Черновик", color: "#6b6860" };
      }
    }

    return NextResponse.json({ success: true, statuses });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}