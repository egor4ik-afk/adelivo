// src/app/(app)/manager/orders/new/page.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { OrderForm } from "@/components/manager/OrderForm";

export const metadata = { title: "Новый заказ" };

export default async function NewOrderPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "COURIER") redirect("/courier/routes");

  const today = new Date().toISOString().split("T")[0];
  return <OrderForm mode="create" initial={{ deliveryDate: today }} />;
}
