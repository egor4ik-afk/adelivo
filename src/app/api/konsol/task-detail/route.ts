// src/app/api/konsol/task-detail/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getKonsolTask } from "@/lib/konsol";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  try {
    const data = await getKonsolTask(taskId);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      state: data.state ?? null,
      duties: data.duties ?? [],
      cost: data.cost ?? 0,
      since_date: data.since_date,
      upto_date: data.upto_date,
      contractor: data.contractor ?? null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}