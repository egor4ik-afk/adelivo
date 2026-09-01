// src/app/(app)/layout.tsx
import { AppTopBar } from "@/components/layout/AppTopBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Шапка с профилем на всех авторизованных страницах.
          На разделах со своей шапкой (менеджер, дашборд, курьер, компания,
          админка) она сама себя прячет — иначе получилось бы две подряд. */}
      <AppTopBar />
      {children}
    </>
  );
}
