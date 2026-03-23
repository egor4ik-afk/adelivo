import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

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
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
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

  const conv = await prisma.conversation.findFirst({
    where: { id, OR: [{ user1Id: session.id }, { user2Id: session.id }] },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Empty" }, { status: 400 });

  const message = await prisma.message.create({
    data: { conversationId: id, senderId: session.id, text: text.trim() },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  });

  await prisma.conversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(message);
}