// src/app/(public)/layout.tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";

// ThemeScript подключён в корневом src/app/layout.tsx — он нужен и кабинетам тоже.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
      <AppFooter />
    </>
  );
}
