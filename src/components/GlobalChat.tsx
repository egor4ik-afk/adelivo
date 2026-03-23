"use client";
import { useState, useEffect, useRef, useCallback } from "react";

type UserInfo = { id: string; firstName?: string | null; lastName?: string | null; email: string; phone?: string | null; role: string };
type LastMessage = { id: string; text?: string | null; mediaType?: string | null; createdAt: string; senderId: string; readAt?: string | null };
type Conversation = { id: string; user1: UserInfo; user2: UserInfo; messages: LastMessage[]; unread: number; updatedAt: string };
type Message = { id: string; text?: string | null; mediaType?: string | null; mediaUrl?: string | null; createdAt: string; sender: UserInfo };

export function GlobalChat({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen]                 = useState(false);
  const [view, setView]                 = useState<"list" | "dialog" | "search">("list");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv]     = useState<Conversation | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [text, setText]                 = useState("");
  const [searchQ, setSearchQ]           = useState("");
  const [searchResults, setSearchResults] = useState<UserInfo[]>([]);
  const [totalUnread, setTotalUnread]   = useState(0);
  const [loading, setLoading]           = useState(false);
  const endRef   = useRef<HTMLDivElement>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) return;
      const data: Conversation[] = await res.json();
      setConversations(data);
      setTotalUnread(data.reduce((s, c) => s + c.unread, 0));
    } catch (e) { console.error(e); }
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`);
      if (!res.ok) return;
      setMessages(await res.json());
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      // Сбрасываем счётчик этого диалога
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread: 0 } : c));
      setTotalUnread(prev => Math.max(0, prev - (activeConv?.unread ?? 0)));
    } catch (e) { console.error(e); }
  }, [activeConv?.unread]);

  // Polling
  useEffect(() => {
    if (!open) return;
    fetchConversations();
    pollRef.current = setInterval(fetchConversations, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, fetchConversations]);

  // Polling сообщений в открытом диалоге
  useEffect(() => {
    if (!open || !activeConv) return;
    const iv = setInterval(() => fetchMessages(activeConv.id), 5000);
    return () => clearInterval(iv);
  }, [open, activeConv, fetchMessages]);

  // Счётчик когда чат закрыт
  useEffect(() => {
    if (open) return;
    const iv = setInterval(fetchConversations, 10000);
    fetchConversations();
    return () => clearInterval(iv);
  }, [open, fetchConversations]);

  const openDialog = async (conv: Conversation) => {
    setActiveConv(conv);
    setView("dialog");
    await fetchMessages(conv.id);
  };

  const startChat = async (user: UserInfo) => {
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: user.id }),
    });
    if (!res.ok) return;
    const conv: Conversation = await res.json();
    await fetchConversations();
    setActiveConv({ ...conv, unread: 0, messages: [] });
    setMessages([]);
    setView("dialog");
    setSearchQ("");
    setSearchResults([]);
  };

  const send = async () => {
    const val = text.trim();
    if (!val || !activeConv || loading) return;
    setText("");
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: val }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages(prev => [...prev, msg]);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        fetchConversations();
      }
    } finally { setLoading(false); }
  };

  // Поиск пользователей
  useEffect(() => {
    if (view !== "search") return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/chat/users?q=${encodeURIComponent(searchQ)}`);
      if (res.ok) setSearchResults(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, view]);

  const userName = (u: UserInfo) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;

  const roleLabel = (r: string) =>
    r === "ADMIN" ? "Админ" : r === "OPERATOR" ? "Оператор" : "Курьер";

  const roleColor = (r: string) =>
    r === "COURIER" ? "#10b981" : "#4a7aff";

  const interlocutor = (c: Conversation) =>
    c.user1.id === currentUserId ? c.user2 : c.user1;

  // ─── Рендер ─────────────────────────────────────────────────────────────────
  return (
    <>
      {open && (
        <div style={{
          position: "fixed", bottom: 80, right: 24,
          width: 340, maxWidth: "calc(100vw - 32px)",
          height: 480, background: "#fff", borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          border: "1px solid #e8e6df",
          display: "flex", flexDirection: "column",
          overflow: "hidden", zIndex: 10000,
        }}>

          {/* ── Шапка ── */}
          <div style={{ padding: "11px 14px", background: "#1a1a18", color: "#fff", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {view !== "list" && (
              <button onClick={() => { setView("list"); setActiveConv(null); setMessages([]); }}
                style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>
                ←
              </button>
            )}
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
              {view === "list"   && "💬 Чаты"}
              {view === "search" && "🔍 Новый чат"}
              {view === "dialog" && activeConv && userName(interlocutor(activeConv))}
            </span>
            {view === "list" && (
              <button onClick={() => { setView("search"); setSearchQ(""); }}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                + Новый
              </button>
            )}
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* ── Список диалогов ── */}
          {view === "list" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {conversations.length === 0 && (
                <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", marginTop: 60 }}>
                  Нет диалогов.<br />Нажмите «+ Новый» чтобы начать
                </div>
              )}
              {conversations.map(c => {
                const other = interlocutor(c);
                const last  = c.messages[0];
                return (
                  <div key={c.id} onClick={() => openDialog(c)}
                    style={{ padding: "10px 14px", borderBottom: "1px solid #f0ede8", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", background: "#fff", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f5f4f0")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                  >
                    {/* Аватар */}
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: roleColor(other.role), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                    {(other.firstName?.[0] ?? other.lastName?.[0] ?? other.email?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>{userName(other)}</span>
                        {last && <span style={{ fontSize: 9, color: "#a8a49c" }}>{new Date(last.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b6860", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {last ? (last.text ?? (last.mediaType === "image" ? "📷 Фото" : "🎤 Голосовое")) : <span style={{ color: "#a8a49c" }}>Нет сообщений</span>}
                      </div>
                    </div>
                    {c.unread > 0 && (
                      <div style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {c.unread > 9 ? "9+" : c.unread}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Поиск пользователей ── */}
          {view === "search" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #e8e6df" }}>
                <input
                  autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  placeholder="Имя, телефон или email..."
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e8e6df", background: "#f5f4f0", outline: "none", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {searchResults.length === 0 && searchQ.length > 0 && (
                  <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", marginTop: 40 }}>Никого не найдено</div>
                )}
                {searchResults.length === 0 && searchQ.length === 0 && (
                  <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", marginTop: 40 }}>Начните вводить для поиска</div>
                )}
                {searchResults.map(u => (
                  <div key={u.id} onClick={() => startChat(u)}
                    style={{ padding: "10px 14px", borderBottom: "1px solid #f0ede8", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", background: "#fff" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#f5f4f0")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: roleColor(u.role), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {(u.firstName?.[0] ?? u.lastName?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>{userName(u)}</div>
                      <div style={{ fontSize: 10, color: roleColor(u.role), fontWeight: 600 }}>{roleLabel(u.role)}</div>
                      <div style={{ fontSize: 10, color: "#a8a49c" }}>{u.phone ?? u.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Диалог ── */}
          {view === "dialog" && (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#fafaf8" }}>
                {messages.length === 0 && (
                  <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", margin: "auto" }}>Напишите первое сообщение</div>
                )}
                {messages.map(m => {
                  const isMe = m.sender.id === currentUserId;
                  return (
                    <div key={m.id} style={{ alignSelf: isMe ? "flex-end" : "flex-start", maxWidth: "80%", background: isMe ? "#1a1a18" : "#fff", color: isMe ? "#fff" : "#1a1a18", padding: "8px 12px", borderRadius: 12, borderBottomRightRadius: isMe ? 2 : 12, borderBottomLeftRadius: isMe ? 12 : 2, border: isMe ? "none" : "1px solid #e8e6df", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{m.text}</div>
                      <div style={{ fontSize: 9, textAlign: "right", marginTop: 3, color: isMe ? "rgba(255,255,255,0.45)" : "#a8a49c" }}>
                        {new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div style={{ padding: 10, borderTop: "1px solid #e8e6df", display: "flex", gap: 8, background: "#fff", flexShrink: 0 }}>
                <input
                  value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder="Сообщение..." disabled={loading}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #e8e6df", background: "#f5f4f0", outline: "none", fontSize: 13 }}
                />
                <button onClick={send} disabled={loading || !text.trim()}
                  style={{ background: "#1a1a18", color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: loading || !text.trim() ? 0.5 : 1 }}>
                  ➤
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Кнопка */}
      <button onClick={() => setOpen(v => !v)}
        style={{ position: "fixed", bottom: 24, right: 24, width: 52, height: 52, borderRadius: "50%", background: "#1a1a18", color: "#fff", border: "none", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
        {open ? "×" : "💬"}
        {!open && totalUnread > 0 && (
          <span style={{ position: "absolute", top: 6, right: 6, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>
    </>
  );
}