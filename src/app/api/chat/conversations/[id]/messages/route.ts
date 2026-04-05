// src/app/api/chat/conversations/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notifications";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // 🔥 БАГФИКС: Если это виртуальный диалог, сразу отдаем пустоту (в базу не лезем)
  if (id.startsWith("virtual_")) {
    return NextResponse.json([]);
  }

  const conv = await prisma.conversation.findFirst({
    where: { id, OR: [{ user1Id: session.id }, { user2Id: session.id }] },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.message.updateMany({
    where: { conversationId: id, senderId: { not: session.id }, readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(messages);
}

export async function POST(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { text, mediaUrl, mediaType } = await req.json();

  if (!text?.trim() && !mediaUrl) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  let actualConvId = id;

  // 🔥 БАГФИКС: Если пришло сообщение в "виртуальный" диалог, ТОЛЬКО СЕЙЧАС создаем его в БД
  if (id.startsWith("virtual_")) {
     const targetUserId = id.replace("virtual_", "");
     const [user1Id, user2Id] = [session.id, targetUserId].sort();
     
     const newConv = await prisma.conversation.upsert({
       where: { user1Id_user2Id: { user1Id, user2Id } },
       create: { user1Id, user2Id },
       update: {}
     });
     actualConvId = newConv.id;
  }

  // 2. Создаем сообщение
  const message = await prisma.message.create({
    data: {
      text: text?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      conversationId: actualConvId, // Используем актуальный ID (с учетом вашего багфикса)
      senderId: session.id,
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
    },
  });

  await prisma.conversation.update({
    where: { id: actualConvId },
    data: { updatedAt: new Date() },
  });

  // 🔥 ОТПРАВЛЯЕМ ПУШ УВЕДОМЛЕНИЕ
  // Чтобы узнать кому отправлять, нужно достать ID собеседника из диалога
  const conversation = await prisma.conversation.findUnique({
    where: { id: actualConvId },
    select: { user1Id: true, user2Id: true }
  });

  if (conversation) {
    const targetUserId = conversation.user1Id === session.id ? conversation.user2Id : conversation.user1Id;
    const senderName = [message.sender.firstName, message.sender.lastName].filter(Boolean).join(" ") || "Коллега";
    
    let pushText = message.text || "";
    if (message.mediaType === "image") pushText = "📷 Фото";
    else if (message.mediaType === "audio") pushText = "🎤 Голосовое сообщение";
    else if (message.mediaType === "file") pushText = "📄 Документ";

    // Асинхронно отправляем пуш, не блокируя ответ клиенту
    notify({
      type: "chat.private",
      senderName,
      text: pushText,
      targetUserId,
      conversationId: actualConvId
    }).catch(console.error);
  }

  if (id.startsWith("virtual_")) {
    return NextResponse.json({ message, actualConvId });
  }

  return NextResponse.json(message);
}