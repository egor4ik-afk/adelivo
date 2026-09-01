// src/app/(app)/couriers/page.tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CouriersClient } from "@/components/CouriersClient";

export default async function CouriersPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  // Раздел с выплатами, телефонами и геолокацией курьеров —
  // только для админов, как и дашборд. Раньше сюда пускало любого
  // вошедшего, включая самих курьеров.
  if (user.role === "COURIER") redirect("/courier/routes");
  if (user.role === "OPERATOR") redirect("/manager");
  if (user.role !== "ADMIN") redirect("/login");

  return <CouriersClient user={user as any} />;
}
