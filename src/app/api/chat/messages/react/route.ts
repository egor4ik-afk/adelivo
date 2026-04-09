// src/app/api/chat/messages/react/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getSession(req as any);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { messageId, emoji } = await req.json();

    // Ищем обычное сообщение по ID
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Парсим текущие реакции из Json
    let reactions: any[] = msg.reactions 
      ? (typeof msg.reactions === 'string' ? JSON.parse(msg.reactions) : msg.reactions) 
      : [];
    if (!Array.isArray(reactions)) reactions = [];

    // Ищем, ставил ли текущий юзер этот же смайл
    const existingIndex = reactions.findIndex((r: any) => r.userId === user.id && r.emoji === emoji);

    if (existingIndex > -1) {
      reactions.splice(existingIndex, 1); // Если уже ставил — убираем (toggle)
    } else {
      reactions.push({ userId: user.id, emoji }); // Если не ставил — добавляем
    }

    // Обновляем сообщение в базе
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { reactions },
      include: { sender: { select: { firstName: true, lastName: true, avatarUrl: true } } }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[MESSAGE_REACT_POST]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}