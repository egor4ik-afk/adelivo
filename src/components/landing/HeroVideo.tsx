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

      {/* Плашка садится точно на вотермарку генератора в правом нижнем углу
          ролика и перекрывает её целиком: отступы почти нулевые, размер
          заметно больше самого знака. С отступом в 12px она вставала ниже
          и правее, и знак торчал из-под неё сверху слева. */}
      <button
        onClick={toggleSound}
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        title={muted ? "Включить звук" : "Выключить звук"}
        style={{
          position: "absolute", right: 2, bottom: 2,
          width: 62, height: 62, borderRadius: 14,
          border: "none",
          background: "rgba(10,12,18,0.95)", color: "#fff",
          cursor: "pointer",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
          padding: 0, overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.svg" alt="" width={26} height={26} style={{ display: "block" }} />

        {/* Состояние звука — подписью, а не значком в углу. Кружок 14px
            поверх логотипа на тёмном фоне было просто не разглядеть. */}
        <span style={{
          fontSize: 8,
          lineHeight: 1,
          fontWeight: 800,
          letterSpacing: "0.03em",
          color: muted ? "rgba(255,255,255,0.7)" : "#8AB4FF",
          whiteSpace: "nowrap",
        }}>
          {muted ? "БЕЗ ЗВУКА" : "ЗВУК ВКЛ"}
        </span>
      </button>

      {caption && (
        <div style={{
          position: "absolute", left: 12, bottom: 12,
          padding: "5px 10px", borderRadius: 8,
          background: "rgba(0,0,0,0.55)", color: "#fff",
          fontSize: "0.72rem", fontWeight: 600, lineHeight: 1.3,
          backdropFilter: "blur(6px)", maxWidth: "calc(100% - 80px)",
        }}>
          {caption}
        </div>
      )}
    </div>
  );
}