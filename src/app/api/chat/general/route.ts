import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const messages = await prisma.globalMessage.findMany({
    orderBy: { createdAt: "asc" },
    take: 300,
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true, email: true } },
    },
  });

  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, mediaUrl, mediaType } = await req.json();

  if (!text?.trim() && !mediaUrl) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const message = await prisma.globalMessage.create({
    data: {
      text: text?.trim() || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      senderId: session.id,
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true, email: true } },
    },
  });

  return NextResponse.json(message);
}