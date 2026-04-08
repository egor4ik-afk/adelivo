// src/app/page.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function RootPage() {
  const user = await getSession();
  
  // 1. Если не авторизован — отправляем на красивый лендинг
  if (!user) {
    redirect("/about");
  }

  // 2. Если это курьер — отправляем в его мобильный интерфейс
  if (user.role === "COURIER") {
    redirect("/courier/routes");
  }

  // 3. Операторов и админов отправляем в дашборд
  redirect("/dashboard");
}