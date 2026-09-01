// src/app/api/chat/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer, coworkerScope } from "@/lib/access";

export async function GET(req: NextRequest) {
  const session = await getViewer(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: {
      id: { not: session.id },
      // Коллега — тот, с кем есть хотя бы один общий магазин.
      // Привязка к companyId здесь не годится: доступ теперь даёт матрица,
      // и человек может работать с магазином другой компании.
      ...(await coworkerScope(session)),
      ...(q ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName:  { contains: q, mode: "insensitive" } },
          { email:     { contains: q, mode: "insensitive" } },
          { phone:     { contains: q, mode: "insensitive" } },
        ],
      } : {}),
    },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, avatarUrl: true },
    take: 20,
  });

  return NextResponse.json(users);
}
