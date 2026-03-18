import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAuthCode, createSession, deleteSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = z.object({
      email: z.string().email(),
      code: z.string().length(6),
    }).parse(await req.json());

    const user = await verifyAuthCode(email, code);
    if (!user) return NextResponse.json({ error: "Неверный или истёкший код" }, { status: 401 });

    await createSession(user.id);
    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    console.error("[verify]", err);
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}

export async function DELETE() {
  await deleteSession();
  return NextResponse.json({ ok: true });
}