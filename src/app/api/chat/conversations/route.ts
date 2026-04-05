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
      messages: { some: {} } // 🔥 Дополнительная защита: не отдаем в список пустые чаты (если они там застряли)
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
  const [user1Id, user2Id] = [session.id, targetUserId].sort();

  // 1. Пытаемся найти СУЩЕСТВУЮЩИЙ диалог
  const existingConv = await prisma.conversation.findUnique({
    where: { user1Id_user2Id: { user1Id, user2Id } },
    include: {
      user1: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
      user2: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
    },
  });

  if (existingConv) {
    return NextResponse.json(existingConv);
  }

  // 2. 🔥 БАГФИКС: Если диалога нет, мы его НЕ СОЗДАЕМ в базе!
  // Вместо этого отдаем "виртуальный" диалог. Он создастся в БД только при отправке сообщения.
  const user1 = await prisma.user.findUnique({ where: { id: user1Id }, select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } });
  const user2 = await prisma.user.findUnique({ where: { id: user2Id }, select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } });

  return NextResponse.json({
    id: `virtual_${targetUserId}`, // <-- Фейковый маркер вместо реального ID
    user1Id,
    user2Id,
    user1,
    user2,
    messages: [],
    unread: 0,
    updatedAt: new Date().toISOString()
  });
}