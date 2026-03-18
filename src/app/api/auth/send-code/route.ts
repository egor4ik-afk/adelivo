import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveAuthCode } from "@/lib/auth";
import { sendAuthCode } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(await req.json());
    const code = await saveAuthCode(email);
    await sendAuthCode(email, code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Неверный email" }, { status: 400 });
    console.error("[send-code]", err);
    return NextResponse.json({ error: "Ошибка отправки" }, { status: 500 });
  }
}