// src/components/AddressSuggest.tsx
"use client";

import { useEffect, useRef, useId } from "react";

/**
 * Поле адреса с подсказками Яндекса.
 *
 * Взято из профиля курьера, где саджест уже работает, и вынесено в общий
 * компонент — чтобы форма заказа и настройки магазина не дублировали ту же
 * возню со скриптом.
 *
 * Работает на API 2.1: в 3.0 саджеста нет, а грузить обе версии ради него
 * не нужно — 2.1 всё равно уже загружен дашбордом и профилем, скрипт
 * переиспользуется.
 */
export function AddressSuggest({
  value,
  onChange,
  placeholder = "Москва, ул. Пушкина, 1",
  className,
  style,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  invalid?: boolean;
}) {
  // useId даёт стабильный уникальный идентификатор: SuggestView требует
  // именно id элемента, а на странице таких полей может быть несколько
  const inputId = `addr-${useId().replace(/:/g, "")}`;

  // Колбэк в ref: SuggestView живёт вне React и держал бы устаревшее
  // замыкание, из-за чего выбранный вариант терялся
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const initedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || disabled) return;

    let cancelled = false;

    const init = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ymaps = (window as any).ymaps;
      if (!ymaps?.SuggestView || cancelled || initedRef.current) return;

      const el = document.getElementById(inputId);
      if (!el) return;

      try {
        const view = new ymaps.SuggestView(inputId, { results: 6 });
        view.events.add("select", (e: { get: (k: string) => { value: string } }) => {
          onChangeRef.current(e.get("item").value);
        });
        initedRef.current = true;
      } catch (err) {
        console.warn("[Адрес] саджест не поднялся", err);
      }
    };

    const waitReady = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ymaps = (window as any).ymaps;
      if (ymaps?.ready) { ymaps.ready(init); return; }

      // Скрипт мог только начать грузиться — ждём появления объекта
      const t = setInterval(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const y = (window as any).ymaps;
        if (y?.ready) { clearInterval(t); y.ready(init); }
      }, 200);
      setTimeout(() => clearInterval(t), 8000);
    };

    const existing = document.querySelector('script[src*="api-maps.yandex.ru/2.1"]');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).ymaps || existing) {
      waitReady();
      return () => { cancelled = true; };
    }

    const mapsKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY || "";
    const suggestKey = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_KEY || mapsKey;

    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${mapsKey}${suggestKey ? `&suggest_apikey=${suggestKey}` : ""}`;
    s.onload = waitReady;
    document.head.appendChild(s);

    return () => { cancelled = true; };
  }, [inputId, disabled]);

  return (
    <input
      id={inputId}
      value={value}
      onChange={(e) => onChangeRef.current(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      className={className}
      style={{
        ...(invalid ? { borderColor: "var(--color-amber)" } : {}),
        ...style,
      }}
    />
  );
}
