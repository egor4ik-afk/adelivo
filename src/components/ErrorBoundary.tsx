// src/components/ErrorBoundary.tsx
// Ловушка ошибок рендера.
//
// Без неё исключение в любом дочернем компоненте размонтирует всё дерево,
// и пользователь видит чёрный экран без единой подсказки — лечится только
// перезагрузкой страницы. Здесь ошибка остаётся внутри своего блока,
// остальной интерфейс продолжает работать, а текст исключения видно
// прямо на экране и можно скопировать.
"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  /** Название блока — попадает в заголовок и в лог. */
  label?: string;
};

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[UI] Ошибка в блоке «${this.props.label ?? "без названия"}»:`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          padding: 16,
          borderRadius: 10,
          border: "1px solid #fecaca",
          background: "#fef2f2",
          color: "#991b1b",
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6 }}>
          Не удалось отобразить: {this.props.label ?? "блок"}
        </div>

        <div style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {error.message}
        </div>

        <button
          onClick={() => this.setState({ error: null })}
          style={{
            marginTop: 10, padding: "6px 12px", borderRadius: 7,
            border: "1px solid #fecaca", background: "#fff",
            color: "#991b1b", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          Попробовать снова
        </button>
      </div>
    );
  }
}