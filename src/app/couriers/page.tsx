// src/app/couriers/page.tsx
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CouriersClient } from "@/components/CouriersClient";

export default async function CouriersPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  return <CouriersClient user={user as any} />;
}