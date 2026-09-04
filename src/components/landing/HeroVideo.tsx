// src/components/landing/HeroVideo.tsx
// Демонстрационный ролик на главной.
//
// Автовоспроизведение в браузере разрешено только беззвучным видео, поэтому
// стартуем с muted и даём кнопку включения звука. Кнопка нужна ещё и потому,
// что внезапный звук на главной раздражает сильнее, чем помогает.
"use client";

import { useRef, useState } from "react";

export function HeroVideo({
  src,
  poster,
  caption,
}: {
  src: string;
  poster?: string;
  caption?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    setMuted(next);
    // Если ролик был на паузе (например, браузер не дал автоплей),
    // включение звука — это явное действие пользователя, можно играть
    if (!next && v.paused) v.play().catch(() => { /* браузер отказал */ });
  };

  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", lineHeight: 0 }}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        // preload="metadata": на мобильном интернете не тянем весь ролик
        // до того, как человек до него доскроллил
        preload="metadata"
        style={{ width: "100%", height: "auto", display: "block" }}
      />

      {/* Правый нижний угол ролика занят вотермаркой генератора.
          Перекрываем её плашкой с нашим favicon и на неё же вешаем
          управление звуком: две кнопки в одном углу мешали друг другу. */}
      <button
        onClick={toggleSound}
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        title={muted ? "Включить звук" : "Выключить звук"}
        style={{
          position: "absolute", right: 8, bottom: 8,
          width: 46, height: 46, borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(12,14,20,0.88)", color: "#fff",
          cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center",
          padding: 0, overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.svg" alt="" width={22} height={22} style={{ display: "block" }} />

        {/* Состояние звука — маленьким значком в углу плашки, чтобы логотип
            оставался читаемым */}
        <span style={{
          position: "absolute", right: 3, bottom: 3,
          width: 14, height: 14, borderRadius: 999,
          background: muted ? "rgba(255,255,255,0.9)" : "var(--color-accent, #2B5BD7)",
          color: muted ? "#0C0E14" : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, lineHeight: 1, fontWeight: 900,
        }}>
          {muted ? "✕" : "♪"}
        </span>
      </button>

      {caption && (
        <div style={{
          position: "absolute", left: 12, bottom: 12,
          padding: "5px 10px", borderRadius: 8,
          background: "rgba(0,0,0,0.55)", color: "#fff",
          fontSize: "0.72rem", fontWeight: 600, lineHeight: 1.3,
          backdropFilter: "blur(6px)", maxWidth: "70%",
        }}>
          {caption}
        </div>
      )}
    </div>
  );
}