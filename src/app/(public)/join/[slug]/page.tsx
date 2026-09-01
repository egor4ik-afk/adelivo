// src/app/(public)/join/[slug]/page.tsx
// Ссылка-приглашение компании: adelivo.ru/join/{slug}?t={token}
// Кто входит по ней — становится сотрудником этой компании.
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { grantCompanyShops } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company || !company.isActive) notFound();

  // Токен обязателен: без него ссылку можно было бы подобрать по названию компании
  if (!company.inviteEnabled || !t || t !== company.inviteToken) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "6rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "0.6rem" }}>Ссылка недействительна</h1>
        <p style={{ color: "var(--color-text-3)", lineHeight: 1.7 }}>
          Приглашение отозвано или адрес скопирован не полностью.
          Попросите в компании прислать ссылку заново.
        </p>
      </div>
    );
  }

  const user = await getSession();

  // Уже вошёл — привязываем к компании, если он ещё ничей
  if (user) {
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyId: true, role: true },
    });
    if (full && !full.companyId) {
      await prisma.user.update({ where: { id: user.id }, data: { companyId: company.id } });
    }
    // Доступ к магазинам выдаём при каждом заходе по ссылке: человек мог
    // зарегистрироваться раньше, а магазины появиться позже
    await grantCompanyShops(user.id, company.id);
    redirect(full?.role === "COURIER" ? "/courier/routes" : "/dashboard");
  }

  // Не вошёл — на форму входа, компанию запомним после авторизации
  redirect(`/login?join=${company.slug}&t=${t}`);
}
