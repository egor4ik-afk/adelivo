// src/app/courier/layout.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CourierNav } from "@/components/CourierNav";

export default async function CourierLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  
  // Если не авторизован или не курьер — выкидываем на логин
  if (!user || user.role !== "COURIER") {
    redirect("/login");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f5f4f0", overflow: "hidden" }}>
      {/* Основной контент страницы (карта или списки) */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      
      {/* Наше новое нижнее меню */}
      <CourierNav />
    </div>
  );
}