// src/app/orders/layout.tsx
// Страница /orders написана как клиентский компонент, поэтому проверку роли
// вешаем на layout — он серверный и выполняется до отрисовки.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function OrdersLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  if (user.role === "COURIER") redirect("/courier/routes");
  if (user.role === "OPERATOR") redirect("/manager");
  if (user.role !== "ADMIN") redirect("/login");

  return <>{children}</>;
}
