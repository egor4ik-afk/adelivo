import { getSession } from "@/lib/auth";
import { GlobalChat } from "./GlobalChat";

export async function GlobalChatWrapper() {
  const session = await getSession();
  
  // Курьеры получают чат через CourierNav — здесь обертку не показываем
  if (!session || session.role === "COURIER") return null;
  
  // Для Операторов и Админов передаем isCourier = false
  return <GlobalChat currentUserId={session.id} isCourier={false} />;
}