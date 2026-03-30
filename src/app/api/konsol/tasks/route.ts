// src/app/api/konsol/tasks/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await getSession(req as any);
  if (session?.role !== "ADMIN" && session?.role !== "OPERATOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tasks = await prisma.konsolTask.findMany({
      include: {
        courier: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            konsolContractorId: true,
          }
        }
      },
      orderBy: [{ date: "desc" }, { courierId: "asc" }]
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}