import { getSession } from "@/lib/auth";
import { GlobalChat } from "./GlobalChat";

export async function GlobalChatWrapper() {
  const session = await getSession();
  // Курьеры получают чат через CourierNav — здесь не показываем
  if (!session || session.role === "COURIER") return null;
  return <GlobalChat currentUserId={session.id} />;
}