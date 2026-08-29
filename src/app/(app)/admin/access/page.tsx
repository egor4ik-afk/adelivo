// src/app/(app)/admin/access/page.tsx
// Глобальная админка: матрица «кто какие магазины видит».
import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/access";
import { AccessMatrix } from "@/components/admin/AccessMatrix";

export const metadata = { title: "Доступы к магазинам" };

export default async function AccessPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isSuperAdmin) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="bg-[var(--color-card)] shadow-sm border-b border-[var(--color-border)] px-4 sm:px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
        <Link
          href="/admin"
          className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors shrink-0"
          aria-label="Назад"
          title="Назад"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </Link>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)] tracking-tight">Доступы к магазинам</h1>
          <p className="text-[12px] text-[var(--color-text-3)]">Кто какие магазины видит и редактирует</p>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-3 sm:p-6">
        <AccessMatrix />
      </main>
    </div>
  );
}
