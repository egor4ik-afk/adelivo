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

      <button
        onClick={toggleSound}
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        title={muted ? "Включить звук" : "Выключить звук"}
        style={{
          position: "absolute", right: 12, bottom: 12,
          width: 40, height: 40, borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.35)",
          background: "rgba(0,0,0,0.55)", color: "#fff",
          cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(6px)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          {muted ? (
            <>
              <path d="m23 9-6 6" />
              <path d="m17 9 6 6" />
            </>
          ) : (
            <>
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M19 5a9 9 0 0 1 0 14" />
            </>
          )}
        </svg>
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