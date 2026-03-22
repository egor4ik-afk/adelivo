// src/components/RouteChat.tsx
"use client";
import { useState, useEffect, useRef } from "react";

export function RouteChat({ routeId }: { routeId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/routes/${routeId}/messages`);
      if (res.ok) setMessages(await res.json());
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // Обновляем каждые 5 сек
    return () => clearInterval(interval);
  }, [routeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    const val = text;
    setText("");
    await fetch(`/api/routes/${routeId}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: val })
    });
    fetchMessages(); // Сразу запрашиваем обновленный список
  };

  if (loading) return <div style={{ fontSize: 12, color: "#a8a49c", padding: 12, textAlign: "center" }}>Загрузка чата...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", marginTop: 16 }}>
      <div style={{ padding: "10px 14px", background: "#f5f4f0", borderBottom: "1px solid #e8e6df", fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>
        💬 Чат по маршруту
      </div>
      
      <div style={{ padding: 14, maxHeight: 300, minHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, background: "#fafaf8" }}>
        {messages.length === 0 && <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", margin: "auto" }}>Напишите первое сообщение</div>}
        
        {messages.map(m => {
          const isOp = m.user.role === "OPERATOR" || m.user.role === "ADMIN";
          return (
            <div key={m.id} style={{ alignSelf: isOp ? "flex-end" : "flex-start", maxWidth: "85%", background: isOp ? "#eef3ff" : "#ecfdf5", color: "#1a1a18", padding: "10px 14px", borderRadius: 12, borderBottomRightRadius: isOp ? 2 : 12, borderBottomLeftRadius: isOp ? 12 : 2, border: `1px solid ${isOp ? '#dbe4ff' : '#d1fae5'}` }}>
              <div style={{ fontSize: 10, color: isOp ? "#4a7aff" : "#10b981", fontWeight: 700, marginBottom: 4 }}>
                {m.user.firstName || "Сотрудник"} {isOp ? "(Оператор)" : "(Курьер)"}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>{m.text}</div>
              <div style={{ fontSize: 9, color: "#a8a49c", textAlign: "right", marginTop: 4 }}>
                {new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div style={{ padding: 10, background: "#fff", borderTop: "1px solid #e8e6df", display: "flex", gap: 8 }}>
        <input 
          value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Сообщение..." style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #e8e6df", background: "#f5f4f0", outline: "none", fontSize: 13 }}
        />
        <button onClick={send} style={{ background: "#1a1a18", color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          ➤
        </button>
      </div>
    </div>
  );
}