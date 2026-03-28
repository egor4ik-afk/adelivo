// src/app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json(null, { status: 401 });
  return NextResponse.json({ role: user.role, id: user.id });
}