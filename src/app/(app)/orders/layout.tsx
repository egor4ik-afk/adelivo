// src/app/(app)/orders/layout.tsx
// Страница /orders написана как клиентский компонент, поэтому проверку роли
// вешаем на layout — он серверный и выполняется до отрисовки.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function OrdersLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  // Менеджера отсюда больше не выкидываем: список заказов ему нужен так же,
  // как админу, и пункт «Заказы» теперь есть у него в меню. Раньше ссылка
  // вела бы на редирект обратно в /manager.
  if (user.role === "COURIER") redirect("/courier/routes");
  if (user.role !== "ADMIN" && user.role !== "OPERATOR") redirect("/login");

  return <>{children}</>;
}