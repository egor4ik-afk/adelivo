// src/app/(app)/company/page.tsx
// Профиль компании: реквизиты, ссылка-приглашение, магазины и подключения.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/access";
import { CompanyClient } from "@/components/company/CompanyClient";

export const metadata = { title: "Компания" };

const SITE_URL = "https://adelivo.ru";

export default async function CompanyPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.role === "COURIER") redirect("/courier/routes");

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="bg-[var(--color-card)] shadow-sm border-b border-[var(--color-border)] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors shrink-0"
          aria-label="Назад"
          title="Назад"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </Link>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)] tracking-tight">Компания</h1>
          <p className="text-[12px] text-[var(--color-text-3)]">Магазины, подключения и сотрудники</p>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto p-3 sm:p-6">
        <CompanyClient siteUrl={SITE_URL} />
      </main>
    </div>
  );
}
