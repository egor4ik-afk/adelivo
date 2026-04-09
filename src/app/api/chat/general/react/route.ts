// src/app/api/chat/general/react/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getSession(req as any);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { messageId, emoji } = await req.json();

    const msg = await prisma.globalMessage.findUnique({ where: { id: messageId } });
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Парсим текущие реакции (если они есть)
    let reactions: any[] = msg.reactions 
      ? (typeof msg.reactions === 'string' ? JSON.parse(msg.reactions) : msg.reactions) 
      : [];
    if (!Array.isArray(reactions)) reactions = [];

    // Проверяем, ставил ли уже этот юзер этот смайл
    const existingIndex = reactions.findIndex(r => r.userId === user.id && r.emoji === emoji);

    if (existingIndex > -1) {
      reactions.splice(existingIndex, 1); // Убираем реакцию (toggle)
    } else {
      reactions.push({ userId: user.id, emoji }); // Добавляем реакцию
    }

    const updated = await prisma.globalMessage.update({
      where: { id: messageId },
      data: { reactions },
      include: { sender: { select: { firstName: true, lastName: true, avatarUrl: true } } }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}