import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const user = await getSession();
  
  // 1. Если не авторизован — на логин
  if (!user) redirect("/login");

  // 2. Жесткая маршрутизация по ролям (Дашборд ТОЛЬКО для Админов)
  if (user.role === "COURIER") redirect("/courier/profile");
  if (user.role === "OPERATOR") redirect("/manager");
  if (user.role !== "ADMIN") redirect("/login");

  // 3. Пускаем только Админа
  return <DashboardClient user={user} />;
}