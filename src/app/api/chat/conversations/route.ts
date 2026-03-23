// src/app/api/chat/conversations/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const convs = await prisma.conversation.findMany({
    where: {
      OR: [{ user1Id: session.id }, { user2Id: session.id }],
    },
    include: {
      user1: { select: { id: true, firstName: true, lastName: true, role: true } },
      user2: { select: { id: true, firstName: true, lastName: true, role: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, text: true, mediaType: true, createdAt: true, senderId: true, readAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Считаем непрочитанные для каждого диалога
  const result = await Promise.all(convs.map(async (c) => {
    const unread = await prisma.message.count({
      where: {
        conversationId: c.id,
        senderId: { not: session.id },
        readAt: null,
      },
    });
    return { ...c, unread };
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { targetUserId } = await req.json();

  // Нормализуем порядок — user1 всегда меньший id лексикографически
  const [user1Id, user2Id] = [session.id, targetUserId].sort();

  const conv = await prisma.conversation.upsert({
    where: { user1Id_user2Id: { user1Id, user2Id } },
    create: { user1Id, user2Id },
    update: {},
    include: {
      user1: { select: { id: true, firstName: true, lastName: true, role: true } },
      user2: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  });

  return NextResponse.json(conv);
}