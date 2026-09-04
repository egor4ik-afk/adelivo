// src/app/(app)/schedule/page.tsx
// Недельный график сотрудников и курьеров.
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/access";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";

export const metadata = { title: "График" };

export default async function SchedulePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  // Курьеры свой график видят в приложении курьера, здесь им делать нечего
  if (viewer.role === "COURIER") redirect("/courier/routes");

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 pt-5">
        <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)] tracking-tight">График</h1>
        <p className="text-[12px] text-[var(--color-text-3)]">Смены сотрудников и курьеров по неделям</p>
      </div>

      <main className="max-w-[1200px] mx-auto p-3 sm:p-6">
        <ScheduleClient />
      </main>
    </div>
  );
}