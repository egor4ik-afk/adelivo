// src/app/api/company/register/route.ts
// Публичная регистрация компании в два шага.
//
// Шаг 1 (start):   проверяем данные → шлём код на почту → кладём заявку
//                  в подписанную cookie на 20 минут.
// Шаг 2 (confirm): проверяем код → создаём компанию → делаем пользователя
//                  её администратором → открываем сессию.
//
// Компания создаётся ТОЛЬКО после подтверждения почты. Иначе адреса вида
// adelivo.ru/magaz можно было бы занимать пачками, не подтверждая ничего.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken, verifyToken, saveAuthCode } from "@/lib/auth";
import { sendAuthCode } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const PENDING_COOKIE = "adelivo_pending_company";

const RESERVED = new Set([
  "admin", "manager", "courier", "couriers", "dashboard", "login", "api", "join",
  "about", "company", "orders", "design", "keysy", "integracii", "vozmozhnosti",
  "pochemu-my", "stat-kurerom", "sistema-upravleniya-kurerami", "ai-marshrutizaciya",
  "register-company", "www", "mail", "static", "assets",
]);

function slugify(raw: string) {
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",
    м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",ч:"ch",ш:"sh",
    щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  };
  return raw.toLowerCase().split("").map((c) => map[c] ?? c).join("")
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

async function checkSlug(slug: string): Promise<string | null> {
  if (slug.length < 3) return "Адрес слишком короткий — минимум 3 символа";
  if (RESERVED.has(slug)) return `Адрес «${slug}» зарезервирован, выберите другой`;
  const taken = await prisma.company.findUnique({ where: { slug } });
  if (taken) return `Адрес «${slug}» уже занят`;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ─────────── Шаг 1: заявка и код на почту ───────────
    if (body.step === "start") {
      const email = String(body.email || "").toLowerCase().trim();
      const name = String(body.name || "").trim();
      const slug = slugify(body.slug || name);
      const phone = String(body.phone || "").trim() || null;

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return NextResponse.json({ error: "Проверьте адрес почты" }, { status: 400 });
      }
      if (name.length < 2) {
        return NextResponse.json({ error: "Укажите название компании" }, { status: 400 });
      }

      const slugError = await checkSlug(slug);
      if (slugError) return NextResponse.json({ error: slugError }, { status: 409 });

      // Если такой пользователь уже есть и состоит в компании — регистрировать нечего
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { companyId: true },
      });
      if (existing?.companyId) {
        return NextResponse.json(
          { error: "Этот email уже привязан к компании. Войдите обычным способом." },
          { status: 409 }
        );
      }

      // saveAuthCode заодно заводит пользователя, если его ещё нет
      const code = await saveAuthCode(email);
      await sendAuthCode(email, code);

      // signToken выставляет срок жизни сам (как у сессии), поэтому
      // ограничиваем заявку двумя способами: сроком жизни cookie
      // и проверкой iat при подтверждении.
      const pending = await signToken({
        kind: "company-registration",
        email, name, slug, phone,
      });

      const res = NextResponse.json({ ok: true, email, slug });
      res.cookies.set(PENDING_COOKIE, pending, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 20 * 60,
      });
      return res;
    }

    // ─────────── Шаг 2: подтверждение кода ───────────
    if (body.step === "confirm") {
      const code = String(body.code || "").trim();
      const raw = req.cookies.get(PENDING_COOKIE)?.value;
      if (!raw) {
        return NextResponse.json(
          { error: "Заявка устарела — начните регистрацию заново" },
          { status: 400 }
        );
      }

      const pending = await verifyToken(raw);
      const tooOld =
        typeof pending?.iat === "number" && Date.now() / 1000 - pending.iat > 20 * 60;
      if (!pending || pending.kind !== "company-registration" || tooOld) {
        return NextResponse.json(
          { error: "Заявка устарела — начните регистрацию заново" },
          { status: 400 }
        );
      }

      const email = String(pending.email);
      const authCode = await prisma.authCode.findFirst({
        where: {
          user: { email: { equals: email, mode: "insensitive" } },
          code, used: false, expiresAt: { gt: new Date() },
        },
        include: { user: true },
        orderBy: { createdAt: "desc" },
      });
      if (!authCode) {
        return NextResponse.json({ error: "Неверный или просроченный код" }, { status: 400 });
      }

      // Пока пользователь вводил код, адрес мог занять кто-то другой
      const slug = String(pending.slug);
      const slugError = await checkSlug(slug);
      if (slugError) return NextResponse.json({ error: slugError }, { status: 409 });

      await prisma.authCode.update({ where: { id: authCode.id }, data: { used: true } });

      const company = await prisma.company.create({
        data: {
          name: String(pending.name),
          slug,
          phone: pending.phone ? String(pending.phone) : null,
          email,
        },
      });

      const user = await prisma.user.update({
        where: { id: authCode.user.id },
        data: { companyId: company.id, role: "ADMIN", lastLoginAt: new Date() },
      });

      // Сессия — тем же способом, что и обычный вход
      const sessionToken = await signToken({ userId: user.id, role: user.role });
      const expiresAt = new Date(Date.now() + 365 * 24 * 3_600_000);
      await prisma.session.create({ data: { token: sessionToken, userId: user.id, expiresAt } });

      const res = NextResponse.json({ ok: true, slug: company.slug });
      res.cookies.set("flowerops_session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
      res.cookies.delete(PENDING_COOKIE);
      return res;
    }

    return NextResponse.json({ error: "Неизвестный шаг" }, { status: 400 });
  } catch (e) {
    console.error("[company/register]", e);
    return NextResponse.json({ error: "Не удалось выполнить запрос" }, { status: 500 });
  }
}

/** GET ?slug=magaz — проверка адреса на лету, пока человек печатает. */
export async function GET(req: NextRequest) {
  const slug = slugify(req.nextUrl.searchParams.get("slug") || "");
  if (!slug) return NextResponse.json({ slug: "", free: false });
  const error = await checkSlug(slug);
  return NextResponse.json({ slug, free: !error, error });
}
