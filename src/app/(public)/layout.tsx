// src/app/(public)/layout.tsx
import { AppHeader } from "@/components/layout/AppHeader";
import { AppFooter } from "@/components/layout/AppFooter";
import { ThemeScript } from "@/components/theme/ThemeScript";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Ставит data-ew-theme на <html> до первой отрисовки + объявляет токены обеих тем */}
      <ThemeScript />
      <AppHeader />
      {children}
      <AppFooter />
    </>
  );
}
