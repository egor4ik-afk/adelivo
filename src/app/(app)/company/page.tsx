// src/app/(app)/company/page.tsx
// Профиль компании: реквизиты, ссылка-приглашение, магазины и подключения.
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
      {/* Своей шапки здесь больше нет.
          Была вторая подряд: общий AppTopBar сверху и эта под ним, со
          стрелкой «назад» на дашборд — при том, что «Дашборд» есть пунктом
          меню. Подзаголовок «Магазины, подключения и сотрудники» тоже убран:
          сотрудников на этой странице нет, они в разделе «Пользователи». */}
      <div className="max-w-[900px] mx-auto px-3 sm:px-6 pt-5">
        <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)] tracking-tight">Компания</h1>
        <p className="text-[12px] text-[var(--color-text-3)]">Реквизиты, магазины и подключения</p>
      </div>

      <main className="max-w-[900px] mx-auto p-3 sm:p-6">
        <CompanyClient siteUrl={SITE_URL} />
      </main>
    </div>
  );
}