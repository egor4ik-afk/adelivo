// src/components/KonsolManager.tsx
"use client";

import { useState } from "react";

export function KonsolManager() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const runSync = async () => {
    if (!confirm("Запустить формирование актов Консоль.Про за текущую неделю?")) return;
    
    setLoading(true);
    setToast(null);

    try {
      const res = await fetch("/api/cron/konsol/weekly");
      const data = await res.json();

      if (res.ok && data.success) {
        setToast({ message: `✅ Успешно! Сформировано актов: ${data.processed} из ${data.total}`, type: "success" });
      } else {
        setToast({ message: `❌ Ошибка: ${data.error || "Неизвестная ошибка"}`, type: "error" });
      }
    } catch (e: any) {
      setToast({ message: `❌ Сетевая ошибка: ${e.message}`, type: "error" });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  // 🔥 Новая функция для ручного обновления статусов
  const checkStatuses = async () => {
    setLoading(true);
    setToast(null);

    try {
      const res = await fetch("/api/konsol/check-status");
      const data = await res.json();

      if (res.ok && data.success) {
        setToast({ message: `✅ Статусы обновлены! Заданий принято: ${data.updated}`, type: "success" });
      } else {
        setToast({ message: `❌ Ошибка: ${data.error || "Неизвестная ошибка"}`, type: "error" });
      }
    } catch (e: any) {
      setToast({ message: `❌ Сетевая ошибка: ${e.message}`, type: "error" });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  return (
    <>
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
        
        {toast && (
          <div style={{ 
            background: toast.type === "success" ? "#10b981" : "#d94040", 
            color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, 
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)", animation: "fadeIn 0.3s ease" 
          }}>
            {toast.message}
          </div>
        )}

        {/* Кнопка обновления статусов */}
        <button 
          onClick={checkStatuses} 
          disabled={loading}
          style={{
            background: loading ? "#a8a49c" : "#3b82f6",
            color: "#fff", border: "none", padding: "12px 20px", borderRadius: 12,
            fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 8
          }}
        >
          {loading ? "⏳ Обновление..." : "🔄 Проверить статусы"}
        </button>

        {/* Кнопка запуска актов */}
        <button 
          onClick={runSync} 
          disabled={loading}
          style={{
            background: loading ? "#a8a49c" : "#1a1a18",
            color: "#fff", border: "none", padding: "12px 20px", borderRadius: 12,
            fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 8
          }}
        >
          {loading ? "⏳ Идет формирование..." : "💼 Финализировать Консоль"}
        </button>

      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </>
  );
}