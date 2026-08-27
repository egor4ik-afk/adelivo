import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CourierNav } from "@/components/CourierNav";

export default async function CourierLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user || user.role !== "COURIER") redirect("/login");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f5f4f0", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
      <CourierNav currentUserId={user.id} />
    </div>
  );
}