"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import imageCompression from "browser-image-compression";

type UserInfo = { id: string; firstName?: string | null; lastName?: string | null; email: string; phone?: string | null; role: string };
type LastMessage = { id: string; text?: string | null; mediaType?: string | null; createdAt: string; senderId: string; readAt?: string | null };
type Conversation = { id: string; user1: UserInfo; user2: UserInfo; messages: LastMessage[]; unread: number; updatedAt: string };
type Message = { id: string; text?: string | null; mediaType?: string | null; mediaUrl?: string | null; createdAt: string; sender: UserInfo };

export function GlobalChat({ currentUserId, isCourier = false }: { currentUserId: string, isCourier?: boolean }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "dialog" | "search">("list");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<UserInfo[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevUnreadRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Запрос прав на уведомления
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Синхронизация бейджей (Вкладка + CustomEvent для Nav)
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) KAMRIKA` : "KAMRIKA";
    window.dispatchEvent(new CustomEvent("chat-unread", { detail: totalUnread }));
  }, [totalUnread]);

  // Слушаем открытие чата из CourierNav
  useEffect(() => {
    const handleOpenChat = () => setOpen(true);
    window.addEventListener("open-chat", handleOpenChat);
    return () => window.removeEventListener("open-chat", handleOpenChat);
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) return;
      const data: Conversation[] = await res.json();
      setConversations(data);
      const unreadCount = data.reduce((s, c) => s + c.unread, 0);
      setTotalUnread(unreadCount);

      if (unreadCount > prevUnreadRef.current) {
        try {
          const audio = new Audio('/message.mp3');
          audio.play().catch(() => { }); // Игнорируем ошибку автоплея
        } catch (e) { }
        if ("Notification" in window && Notification.permission === "granted" && !open) {
          new Notification("Новое сообщение", { icon: "/favicon-96x96.png" });
        }
      }
      prevUnreadRef.current = unreadCount;
    } catch (e) { console.error(e); }
  }, [open]);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`);
      if (!res.ok) return;
      setMessages(await res.json());
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread: 0 } : c));
      setTotalUnread(prev => Math.max(0, prev - (activeConv?.unread ?? 0)));
    } catch (e) { console.error(e); }
  }, [activeConv?.unread]);

  // Поллинг
  useEffect(() => {
    if (!open) return;
    fetchConversations();
    pollRef.current = setInterval(fetchConversations, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, fetchConversations]);

  useEffect(() => {
    if (!open || !activeConv) return;
    const iv = setInterval(() => fetchMessages(activeConv.id), 5000);
    return () => clearInterval(iv);
  }, [open, activeConv, fetchMessages]);

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
    const res = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUserId: user.id }) });
    if (!res.ok) return;
    const conv = await res.json();
    await fetchConversations();
    setActiveConv({ ...conv, unread: 0, messages: [] });
    setMessages([]); setView("dialog"); setSearchQ(""); setSearchResults([]);
  };

  const send = async (payload?: { mediaUrl: string; mediaType: string }) => {
    const val = text.trim();
    if ((!val && !payload) || !activeConv || loading) return;
    setText("");
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/conversations/${activeConv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: val, ...payload }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages(prev => [...prev, msg]);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        fetchConversations();
      }
    } finally { setLoading(false); }
  };

  // ─── Загрузка файлов (Прямая ссылка + Сжатие) ───
  const uploadFileToS3 = async (file: File | Blob, filename: string, type: string) => {
    let finalFile = file;
    if (type.startsWith("image/")) {
      try {
        finalFile = await imageCompression(file as File, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
      } catch (e) { console.error("Ошибка сжатия:", e); }
    }
    const presignRes = await fetch("/api/upload", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, contentType: type }),
    });
    if (!presignRes.ok) throw new Error("Не удалось получить ссылку");
    const { uploadUrl, fileUrl } = await presignRes.json();
    await fetch(uploadUrl, { method: "PUT", body: finalFile, headers: { "Content-Type": type } });
    return fileUrl;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;
    setLoading(true);
    try {
      let type = "file";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";

      const url = await uploadFileToS3(file, file.name, file.type);
      await send({ mediaUrl: url, mediaType: type });
    } catch (e) { alert("Ошибка загрузки файла"); }
    finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Запись голосовых ───
  const toggleRecording = async () => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        setLoading(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const url = await uploadFileToS3(audioBlob, "voice.webm", "audio/webm");
          await send({ mediaUrl: url, mediaType: "audio" });
        } catch (e) { alert("Ошибка отправки голосового"); }
        finally {
          setLoading(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) { alert("Доступ к микрофону запрещен"); }
  };

  // Поиск пользователей (Debounced)
  useEffect(() => {
    if (view !== "search") return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/chat/users?q=${encodeURIComponent(searchQ)}`);
      if (res.ok) setSearchResults(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, view]);

  const userName = (u: UserInfo) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
  const roleLabel = (r: string) => r === "ADMIN" ? "Админ" : r === "OPERATOR" ? "Оператор" : "Курьер";
  const roleColor = (r: string) => r === "COURIER" ? "#10b981" : "#4a7aff";
  const interlocutor = (c: Conversation) => c.user1.id === currentUserId ? c.user2 : c.user1;

  return (
    <>
      {/* Стили анимаций и скрытия десктопной кнопки на мобилках */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseDot {
          0% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 8px rgba(239, 68, 68, 0.6); }
          100% { transform: scale(0.8); opacity: 0.5; }
        }
        .chat-window { animation: slideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .record-dot { animation: pulseDot 1.5s infinite; }
        ${isCourier ? '@media (max-width: 768px) { .desktop-chat-btn { display: none !important; } }' : ''}
      `}} />

      {open && (
        <div className="chat-window" style={{
          position: "fixed", bottom: 80, right: 24, width: 340, maxWidth: "calc(100vw - 32px)",
          height: 480, background: "#fff", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
          border: "1px solid #e8e6df", display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 10000,
        }}>

          {/* ── Шапка ── */}
          <div style={{ padding: "11px 14px", background: "#1a1a18", color: "#fff", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {view !== "list" && (
              <button onClick={() => { setView("list"); setActiveConv(null); setMessages([]); }} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
            )}
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {view === "list" && "💬 Чаты"}
              {view === "search" && "🔍 Новый чат"}
              {view === "dialog" && activeConv && userName(interlocutor(activeConv))}
            </span>
            {view === "list" && (
              <button onClick={() => { setView("search"); setSearchQ(""); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>+ Новый</button>
            )}
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>

          {/* ── Список диалогов ── */}
          {view === "list" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {conversations.length === 0 && <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", marginTop: 60 }}>Нет диалогов.<br />Нажмите «+ Новый» чтобы начать</div>}
              {conversations.map(c => {
                const other = interlocutor(c);
                const last = c.messages[0];
                return (
                  <div key={c.id} onClick={() => openDialog(c)} style={{ padding: "10px 14px", borderBottom: "1px solid #f0ede8", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", background: "#fff", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f4f0")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: roleColor(other.role), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                      {(other.firstName?.[0] ?? other.lastName?.[0] ?? other.email?.[0] ?? "?").toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName(other)}</span>
                        {last && <span style={{ fontSize: 10, color: "#a8a49c" }}>{new Date(last.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b6860", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                        {last ? (last.text ?? (last.mediaType === "image" ? "📷 Фото" : last.mediaType === "video" ? "🎥 Видео" : "🎤 Голосовое")) : <span style={{ color: "#a8a49c" }}>Нет сообщений</span>}
                      </div>
                    </div>
                    {c.unread > 0 && <div style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", minWidth: 20, height: 20, padding: "0 6px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.unread > 9 ? "9+" : c.unread}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Поиск ── */}
          {view === "search" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #e8e6df" }}>
                <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Имя, телефон или email..." style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e8e6df", background: "#f5f4f0", outline: "none", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {searchResults.length === 0 && searchQ.length > 0 && <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", marginTop: 40 }}>Никого не найдено</div>}
                {searchResults.map(u => (
                  <div key={u.id} onClick={() => startChat(u)} style={{ padding: "10px 14px", borderBottom: "1px solid #f0ede8", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", background: "#fff", transition: "background 0.1s" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f4f0")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: roleColor(u.role), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{(u.firstName?.[0] ?? u.lastName?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>{userName(u)}</div>
                      <div style={{ fontSize: 10, color: roleColor(u.role), fontWeight: 600 }}>{roleLabel(u.role)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Диалог ── */}
          {view === "dialog" && (
            <>
              <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "#fafaf8" }}>
                {messages.length === 0 && <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", margin: "auto" }}>Напишите первое сообщение</div>}
                {messages.map(m => {
                  const isMe = m.sender.id === currentUserId;
                  return (
                    <div key={m.id} style={{ alignSelf: isMe ? "flex-end" : "flex-start", maxWidth: "80%", background: isMe ? "#1a1a18" : "#fff", color: isMe ? "#fff" : "#1a1a18", padding: "8px 12px", borderRadius: 14, borderBottomRightRadius: isMe ? 4 : 14, borderBottomLeftRadius: isMe ? 14 : 4, border: isMe ? "none" : "1px solid #e8e6df", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
                      {m.mediaType === "image" && m.mediaUrl && <img src={m.mediaUrl} alt="Фото" style={{ width: "100%", borderRadius: 8, marginBottom: m.text ? 6 : 0 }} />}
                      {m.mediaType === "video" && m.mediaUrl && <video controls src={m.mediaUrl} style={{ width: "100%", borderRadius: 8, marginBottom: m.text ? 6 : 0, maxHeight: 250, backgroundColor: "#000" }} />}
                      {m.mediaType === "audio" && m.mediaUrl && <audio controls src={m.mediaUrl} style={{ height: 36, width: 220, marginBottom: m.text ? 6 : 0 }} />}
                      {m.text && <div style={{ fontSize: 14, lineHeight: 1.4, wordBreak: "break-word" }}>{m.text}</div>}
                      <div style={{ fontSize: 10, textAlign: "right", marginTop: 4, color: isMe ? "rgba(255,255,255,0.5)" : "#a8a49c" }}>
                        {new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {/* ── Панель Ввода ── */}
              <div style={{ padding: 10, borderTop: "1px solid #e8e6df", display: "flex", gap: 8, background: "#fff", flexShrink: 0, alignItems: "center" }}>
                <input type="file" accept="image/*,audio/*,video/*" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: "0 4px", opacity: loading || isRecording ? 0.5 : 1, transition: "opacity 0.2s" }} disabled={loading || isRecording}>📎</button>

                {isRecording ? (
                  <div style={{ flex: 1, color: "#ef4444", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, paddingLeft: 8 }}>
                    <span className="record-dot" style={{ width: 10, height: 10, background: "#ef4444", borderRadius: "50%", display: "inline-block" }} />
                    Идет запись...
                  </div>
                ) : (
                  <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} placeholder="Сообщение..." disabled={loading} style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1px solid #e8e6df", background: "#f5f4f0", outline: "none", fontSize: 14, transition: "border 0.2s" }} />
                )}

                {text.trim() ? (
                  <button onClick={() => send()} disabled={loading} style={{ background: "#4a7aff", color: "#fff", border: "none", borderRadius: 20, padding: "0 16px", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: loading ? 0.5 : 1, height: 38, boxShadow: "0 2px 8px rgba(74,122,255,0.2)", transition: "all 0.2s" }}>➤</button>
                ) : (
                  <button onClick={toggleRecording} disabled={loading} style={{ background: isRecording ? "#ef4444" : "#f5f4f0", color: isRecording ? "#fff" : "#1a1a18", border: isRecording ? "none" : "1px solid #e8e6df", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 18, cursor: "pointer", opacity: loading ? 0.5 : 1, transition: "all 0.2s", boxShadow: isRecording ? "0 2px 12px rgba(239, 68, 68, 0.3)" : "none" }}>
                    {isRecording ? "⏹" : "🎤"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Плавающая кнопка для ПК */}
      <button className="desktop-chat-btn" onClick={() => setOpen(v => !v)} style={{ position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%", background: "#1a1a18", color: "#fff", border: "none", fontSize: 24, cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, transition: "transform 0.2s" }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.95)"} onMouseUp={e => e.currentTarget.style.transform = "scale(1)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
        {open ? "×" : "💬"}
        {!open && totalUnread > 0 && <span style={{ position: "absolute", top: 4, right: 4, background: "#ef4444", color: "#fff", borderRadius: "50%", minWidth: 20, height: 20, padding: "0 5px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #1a1a18" }}>{totalUnread > 9 ? "9+" : totalUnread}</span>}
      </button>
    </>
  );
}