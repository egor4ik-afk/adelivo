// src/app/api/routes/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: routeId } = await context.params; // 🔥 Ждем params через await

    const messages = await prisma.routeMessage.findMany({
      where: { routeId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, firstName: true, role: true } } }
    });
    
    return NextResponse.json(messages);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: routeId } = await context.params; // 🔥 Ждем params через await
    const { text } = await req.json();
    
    if (!text) return NextResponse.json({ error: "Empty text" }, { status: 400 });

    const msg = await prisma.routeMessage.create({
      data: { text, routeId, userId: user.id },
      include: { user: { select: { id: true, firstName: true, role: true } } }
    });
    
    return NextResponse.json(msg);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}