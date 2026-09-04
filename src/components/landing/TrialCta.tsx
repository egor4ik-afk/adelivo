"use client";

import { useEffect, useState } from "react";

export function TrialCta({
  href = "/register-company",
  /** Якорь, рядом с которым кнопку нужно спрятать, чтобы не мешать форме. */
  hideNearId = "request",
}: { href?: string; hideNearId?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Не показываем в самом верху (там своя большая кнопка в первом экране)
    // и на самой форме — иначе кнопка перекрывала бы поля.
    const onScroll = () => {
      const form = document.getElementById(hideNearId);
      const formTop = form ? form.getBoundingClientRect().top : Infinity;
      setVisible(window.scrollY > 500 && formTop > window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [hideNearId]);

  return (
    <a
      // Ведём на регистрацию компании: это целевая страница пробного
      // периода. Раньше кнопка скроллила к форме заявки, из которой
      // начать самому было нельзя — только ждать менеджера.
      href={href}
      style={{
        position: "fixed",
        // На мобиле кнопка растягивается по ширине: попасть пальцем в узкую
        // пилюлю у края экрана заметно труднее
        left: "max(16px, calc(50% - 620px))",
        right: "max(16px, calc(50% - 620px))",
        bottom: 16,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        margin: "0 auto",
        maxWidth: 420,
        padding: "14px 22px",
        borderRadius: 999,
        background: "var(--color-accent, #2B5BD7)",
        color: "#fff",
        fontWeight: 800,
        fontSize: "0.95rem",
        textDecoration: "none",
        textAlign: "center",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity .2s, transform .2s",
      }}
    >
      Попробовать 7 дней бесплатно
    </a>
  );
}