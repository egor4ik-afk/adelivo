// src/app/api/chat/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Get messages for a conversation with a specific user
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const recipientId = searchParams.get("recipientId");

  if (!recipientId) {
    return NextResponse.json({ error: "recipientId is required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      OR: [
        { user1Id: session.id, user2Id: recipientId },
        { user1Id: recipientId, user2Id: session.id },
      ],
    },
  });

  if (!conversation) {
    return NextResponse.json([]); // No conversation, no messages
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: conversation.id,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, role: true },
      },
    },
  });

  return NextResponse.json(messages);
}

// Send a message to a specific user
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, recipientId } = await req.json();

  if (!text?.trim() || !recipientId) {
    return NextResponse.json({ error: "Text and recipientId are required" }, { status: 400 });
  }

  if (session.id === recipientId) {
    return NextResponse.json({ error: "Cannot send message to yourself" }, { status: 400 });
  }

  // Find or create conversation
  let conversation = await prisma.conversation.findFirst({
    where: {
      OR: [
        { user1Id: session.id, user2Id: recipientId },
        { user1Id: recipientId, user2Id: session.id },
      ],
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        user1Id: session.id,
        user2Id: recipientId,
      },
    });
  }

  const message = await prisma.message.create({
    data: {
      text: text.trim(),
      conversationId: conversation.id,
      senderId: session.id,
    },
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, role: true },
      },
    },
  });

  return NextResponse.json(message);
}
