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
      messages: { some: {} },
    },
    include: {
      user1: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
      user2: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, text: true, mediaType: true, createdAt: true, senderId: true, readAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (convs.length === 0) return NextResponse.json([]);

  // 🔥 Один запрос вместо N — считаем непрочитанные для всех диалогов сразу
  const convIds = convs.map(c => c.id);
  const unreadCounts = await prisma.message.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: convIds },
      senderId: { not: session.id },
      readAt: null,
    },
    _count: { id: true },
  });

  const unreadMap: Record<string, number> = {};
  for (const row of unreadCounts) {
    unreadMap[row.conversationId] = row._count.id;
  }

  const result = convs.map(c => ({ ...c, unread: unreadMap[c.id] ?? 0 }));
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { targetUserId } = await req.json();
  const [user1Id, user2Id] = [session.id, targetUserId].sort();

  const existingConv = await prisma.conversation.findUnique({
    where: { user1Id_user2Id: { user1Id, user2Id } },
    include: {
      user1: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
      user2: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
    },
  });

  if (existingConv) return NextResponse.json(existingConv);

  // Виртуальный диалог — создаётся в БД только при первом сообщении
  const [user1, user2] = await Promise.all([
    prisma.user.findUnique({ where: { id: user1Id }, select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } }),
    prisma.user.findUnique({ where: { id: user2Id }, select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } }),
  ]);

  return NextResponse.json({
    id: `virtual_${targetUserId}`,
    user1Id, user2Id, user1, user2,
    messages: [], unread: 0,
    updatedAt: new Date().toISOString(),
  });
}