// src/app/api/chat/general/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getViewer, userScope } from "@/lib/access";
import { notify } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 🔥 Пагинация: limit и before
  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 100);
  const before = searchParams.get("before");

  // Общий чат был общим на всю систему: сотрудник новой компании читал
  // переписку Банча и наоборот. Сообщение принадлежит компании через автора.
  const viewer = await getViewer(req);
  const scope = viewer ? { sender: userScope(viewer) } : {};

  const messages = await prisma.globalMessage.findMany({
    where: {
      ...scope,
      ...(before ? {
        createdAt: {
          lt: (await prisma.globalMessage.findUnique({ where: { id: before }, select: { createdAt: true } }))?.createdAt ?? new Date(),
        }
      } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(messages.reverse());
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
      sender: { select: { id: true, firstName: true, lastName: true, role: true, email: true, avatarUrl: true } },
    },
  });

  const senderName = [message.sender.firstName, message.sender.lastName].filter(Boolean).join(" ") || "Коллега";
  let pushText = message.text || "";
  if (message.mediaType === "image") pushText = "📷 Фото";
  else if (message.mediaType === "audio") pushText = "🎤 Голосовое сообщение";
  else if (message.mediaType === "file") pushText = "📄 Документ";

  notify({ type: "chat.global", senderName, text: pushText, senderId: session.id }).catch(console.error);

  return NextResponse.json(message);
}