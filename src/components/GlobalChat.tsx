// src/components/GlobalChat.tsx
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import imageCompression from "browser-image-compression";
import { usePathname } from "next/navigation";

type UserInfo = { id: string; firstName?: string | null; lastName?: string | null; email: string; phone?: string | null; role: string; avatarUrl?: string | null };
type LastMessage = { id: string; text?: string | null; mediaType?: string | null; createdAt: string; senderId: string; readAt?: string | null };
type Conversation = { id: string; user1: UserInfo; user2: UserInfo; messages: LastMessage[]; unread: number; updatedAt: string };
type Reaction = { userId: string; emoji: string };
type Message = { id: string; text?: string | null; mediaType?: string | null; mediaUrl?: string | null; createdAt: string; sender: UserInfo; readAt?: string | null; reactions?: Reaction[] | null };

const MSG_LIMIT = 30;

// Форматирует дату для разделителя
function formatDateDivider(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) return "Сегодня";
  if (msgDay.getTime() === yesterday.getTime()) return "Вчера";
  return d.toLocaleDateString("ru", { day: "numeric", month: "long" });
}

// Вставляет разделители дат между сообщениями
function withDateDividers(msgs: Message[]): (Message | { type: "divider"; label: string; key: string })[] {
  const result: (Message | { type: "divider"; label: string; key: string })[] = [];
  let lastDay = "";
  for (const m of msgs) {
    const day = new Date(m.createdAt).toDateString();
    if (day !== lastDay) {
      result.push({ type: "divider", label: formatDateDivider(m.createdAt), key: `div-${day}` });
      lastDay = day;
    }
    result.push(m);
  }
  return result;
}

export function GlobalChat({ currentUserId, isCourier = false }: { currentUserId: string, isCourier?: boolean }) {
  const pathname = usePathname();
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
  const [hasNewGlobal, setHasNewGlobal] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Пагинация
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const oldestMsgIdRef = useRef<string | null>(null);

  // Реакции
  const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "👎", "🔥"];
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReact = async (msgId: string, emoji: string, isGeneral: boolean) => {
    setPickerMsgId(null);
    const url = isGeneral ? "/api/chat/general/react" : "/api/chat/messages/react";
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: msgId, emoji }) });
      if (!res.ok) return;
      const updated = await res.json();
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: updated.reactions } : m));
    } catch (e) { console.error(e); }
  };

  const startLongPress = (msgId: string) => { longPressTimer.current = setTimeout(() => setPickerMsgId(msgId), 400); };
  const cancelLongPress = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

  const [notifyMode, setNotifyMode] = useState<"sound" | "mute">("sound");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chat_notify_mode");
      if (saved === "mute") setNotifyMode("mute");
    }
  }, []);
  const toggleNotifyMode = () => {
    setNotifyMode(prev => {
      const next = prev === "sound" ? "mute" : "sound";
      localStorage.setItem("chat_notify_mode", next);
      return next;
    });
  };

  const endRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevUnreadRef = useRef(-1); // -1 = не инициализирован
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    document.title = (totalUnread > 0 || hasNewGlobal) ? `(Новое) KAMRIKA` : "KAMRIKA";
    window.dispatchEvent(new CustomEvent("chat-unread", { detail: totalUnread + (hasNewGlobal ? 1 : 0) }));
  }, [totalUnread, hasNewGlobal]);

  // Закрываем пикер при клике вне
  useEffect(() => {
    if (!pickerMsgId) return;
    const close = () => setPickerMsgId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [pickerMsgId]);

  useEffect(() => {
    const handleOpenChat = () => setOpen(true);
    window.addEventListener("open-chat", handleOpenChat);
    return () => window.removeEventListener("open-chat", handleOpenChat);
  }, []);

  const playNotificationSound = useCallback(() => {
    try { const audio = new Audio('/message.mp3'); audio.play().catch(() => {}); } catch (e) {}
  }, []);

  const forceDownload = async (url: string, filename: string) => {
    try {
      // Вырезаем key из CDN URL: cdn.relaxdev.ru/chat/123.jpg → chat/123.jpg
      const key = new URL(url).pathname.replace(/^\//, "");

      // Дёргаем iziposta для получения presigned download URL
      const IZIPOSTA_URL = "https://izipost.ru";
      const res = await fetch(`${IZIPOSTA_URL}/api/files/download?key=${encodeURIComponent(key)}&name=${encodeURIComponent(filename || "file")}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      if (!data.url) throw new Error("no url");

      const link = document.createElement("a");
      link.href = data.url;
      link.download = filename || "file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      window.open(url, "_blank");
    }
  };

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data: Conversation[] = await res.json();
        setConversations(data);
        const unreadCount = data.reduce((s, c) => s + c.unread, 0);
        setTotalUnread(unreadCount);
        // 🔥 Звук только если unread реально вырос (не при первой загрузке)
        if (unreadCount > prevUnreadRef.current && prevUnreadRef.current !== -1) {
          if (notifyMode === "sound") playNotificationSound();
        }
        // -1 = первая загрузка, не считать как "новые"
        if (prevUnreadRef.current === -1) prevUnreadRef.current = unreadCount;
        else prevUnreadRef.current = unreadCount;
      }
      const gRes = await fetch("/api/chat/general");
      if (gRes.ok) {
        const gMsgs = await gRes.json();
        const latest = gMsgs[gMsgs.length - 1];
        if (latest) {
          const lastSeen = localStorage.getItem("last_global_msg");
          if (lastSeen !== latest.id && latest.senderId !== currentUserId) {
            setHasNewGlobal(true);
            if (notifyMode === "sound") playNotificationSound();
            localStorage.setItem("last_global_msg", latest.id);
          }
        }
      }
    } catch (e) { console.error(e); }
  }, [open, currentUserId, playNotificationSound, notifyMode]);

  // 🔥 Загрузка сообщений с пагинацией
  const fetchMessages = useCallback(async (convId: string, isInitialLoad = false) => {
    if (convId.startsWith("virtual_")) { setMessages([]); return; }
    try {
      let url: string;
      if (convId === "general") {
        url = `/api/chat/general?limit=${MSG_LIMIT}`;
      } else {
        url = `/api/chat/conversations/${convId}/messages?limit=${MSG_LIMIT}`;
      }

      const res = await fetch(url);
      if (!res.ok) return;
      const msgs: Message[] = await res.json();

      setMessages(msgs);
      setHasMore(msgs.length >= MSG_LIMIT);
      oldestMsgIdRef.current = msgs[0]?.id ?? null;

      if (isInitialLoad) {
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto" }), 50);
      } else {
        const container = chatBodyRef.current;
        const isAtBottom = container ? (container.scrollHeight - container.scrollTop - container.clientHeight < 150) : true;
        if (isAtBottom) setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }

      if (convId === "general") {
        if (msgs.length > 0) localStorage.setItem("last_global_msg", msgs[msgs.length - 1].id);
      } else {
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread: 0 } : c));
        setTotalUnread(prev => Math.max(0, prev - (activeConv?.unread ?? 0)));
      }
    } catch (e) { console.error(e); }
  }, [activeConv?.unread]);

  // 🔥 Подгрузка старых сообщений при скролле вверх
  const loadMoreMessages = useCallback(async () => {
    if (!activeConv || loadingMore || !hasMore || !oldestMsgIdRef.current) return;
    setLoadingMore(true);
    try {
      const convId = activeConv.id;
      let url: string;
      if (convId === "general") {
        url = `/api/chat/general?limit=${MSG_LIMIT}&before=${oldestMsgIdRef.current}`;
      } else {
        url = `/api/chat/conversations/${convId}/messages?limit=${MSG_LIMIT}&before=${oldestMsgIdRef.current}`;
      }
      const res = await fetch(url);
      if (!res.ok) return;
      const older: Message[] = await res.json();
      if (older.length === 0) { setHasMore(false); return; }

      // Сохраняем позицию скролла перед добавлением
      const container = chatBodyRef.current;
      const scrollHeightBefore = container?.scrollHeight ?? 0;

      setMessages(prev => [...older, ...prev]);
      setHasMore(older.length >= MSG_LIMIT);
      oldestMsgIdRef.current = older[0]?.id ?? null;

      // Восстанавливаем позицию скролла
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - scrollHeightBefore;
        }
      });
    } finally {
      setLoadingMore(false);
    }
  }, [activeConv, loadingMore, hasMore]);

  // 🔥 Обработчик скролла для подгрузки
  const handleScroll = useCallback(() => {
    const container = chatBodyRef.current;
    if (!container) return;
    if (container.scrollTop < 60 && hasMore && !loadingMore) {
      loadMoreMessages();
    }
  }, [hasMore, loadingMore, loadMoreMessages]);

  useEffect(() => {
    if (!open) return;
    fetchConversations();
    pollRef.current = setInterval(fetchConversations, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, fetchConversations]);

  useEffect(() => {
    if (!open || !activeConv) return;
    const iv = setInterval(() => fetchMessages(activeConv.id, false), 5000);
    return () => clearInterval(iv);
  }, [open, activeConv, fetchMessages]);

  useEffect(() => {
    if (open) return;
    const iv = setInterval(fetchConversations, 10000);
    fetchConversations();
    return () => clearInterval(iv);
  }, [open, fetchConversations]);

  const openDialog = async (convOrId: Conversation | "general") => {
    if (convOrId === "general") {
      setActiveConv({ id: "general" } as any);
      setView("dialog");
      setHasNewGlobal(false);
      await fetchMessages("general", true);
    } else {
      setActiveConv(convOrId);
      setView("dialog");
      await fetchMessages(convOrId.id, true);
    }
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
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setLoading(true);
    try {
      const url = activeConv.id === "general" ? "/api/chat/general" : `/api/chat/conversations/${activeConv.id}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: val, ...payload }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.actualConvId) {
          setMessages(prev => [...prev, data.message]);
          setActiveConv(prev => prev ? { ...prev, id: data.actualConvId } : null);
        } else {
          const msg: Message = data;
          setMessages(prev => [...prev, msg]);
          if (activeConv.id === "general") localStorage.setItem("last_global_msg", msg.id);
        }
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        fetchConversations();
      }
    } finally { setLoading(false); }
  };

  const uploadFileToS3 = async (file: File | Blob, filename: string, type: string) => {
    let finalFile = file;
    const contentType = type || "application/octet-stream";
    if (type.startsWith("image/")) {
      try { finalFile = await imageCompression(file as File, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true }); } catch (e) {}
    }
    const presignRes = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename, contentType }) });
    if (!presignRes.ok) throw new Error("Не удалось получить ссылку");
    const { uploadUrl, fileUrl } = await presignRes.json();
    await fetch(uploadUrl, { method: "PUT", body: finalFile, headers: { "Content-Type": contentType } });
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
    finally { setLoading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items || !activeConv) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          setLoading(true);
          try { const url = await uploadFileToS3(file, `screenshot-${Date.now()}.png`, file.type); await send({ mediaUrl: url, mediaType: "image" }); }
          catch (err) { alert("Ошибка загрузки скриншота"); }
          finally { setLoading(false); }
        }
        break;
      }
    }
  };

  const toggleRecording = async () => {
    if (isRecording && mediaRecorderRef.current) { mediaRecorderRef.current.stop(); setIsRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        setLoading(true);
        try { const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" }); const url = await uploadFileToS3(audioBlob, "voice.webm", "audio/webm"); await send({ mediaUrl: url, mediaType: "audio" }); }
        catch (e) { alert("Ошибка отправки голосового"); }
        finally { setLoading(false); stream.getTracks().forEach(track => track.stop()); }
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) { alert("Доступ к микрофону запрещен"); }
  };

  useEffect(() => {
    if (view !== "search") return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/chat/users?q=${encodeURIComponent(searchQ)}`);
      if (res.ok) setSearchResults(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, view]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // 🔥 Умная дата: сегодня → время, вчера → "Вчера", старше → дата
  const formatLastMsgTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (msgDay.getTime() === today.getTime())
      return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
    if (msgDay.getTime() === yesterday.getTime()) return "Вчера";
    if (now.getFullYear() === d.getFullYear())
      return d.toLocaleDateString("ru", { day: "numeric", month: "short" }); // "14 апр"
    return d.toLocaleDateString("ru", { day: "numeric", month: "short", year: "2-digit" }); // "14 апр 24"
  };

  const userName = (u?: UserInfo | null) => {
    if (!u) return "Неизвестный";
    return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "Курьер";
  };
  const roleLabel = (r?: string) => r === "ADMIN" ? "Админ" : r === "OPERATOR" ? "Оператор" : "Курьер";
  const roleColor = (r?: string) => r === "COURIER" ? "#10b981" : "#4a7aff";
  const interlocutor = (c: Conversation) => String(c.user1?.id) === String(currentUserId) ? c.user2 : c.user1;

  // 🔥 Позиция: оператор — левый угол, курьер — кнопка скрыта (она в навбаре)
  const btnLeft = !isCourier ? 24 : undefined;
  const btnRight = !isCourier ? undefined : 24;
  const windowLeft = !isCourier ? 24 : undefined;
  const windowRight = !isCourier ? undefined : 24;

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseDot {
          0% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 8px rgba(239, 68, 68, 0.6); }
          100% { transform: scale(0.8); opacity: 0.5; }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .chat-window { animation: slideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .record-dot { animation: pulseDot 1.5s infinite; }
        .lightbox { animation: fadeIn 0.2s ease forwards; }
        .spinner { animation: spin 1s linear infinite; }
        .chat-textarea::-webkit-scrollbar { width: 4px; }
        .chat-textarea::-webkit-scrollbar-thumb { background: #dcdcdc; border-radius: 4px; }
      `}} />

      {fullscreenImage && (
        <div className="lightbox" onClick={() => setFullscreenImage(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 20 }}>
          <img src={fullscreenImage} alt="Fullscreen" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} />
          <div style={{ position: "absolute", top: 20, right: 20, display: "flex", gap: 10 }}>
            <button onClick={(e) => { e.stopPropagation(); forceDownload(fullscreenImage, "image.jpg"); }} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", padding: "8px 16px", borderRadius: 20, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>📥 Скачать</button>
            <button style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 36, height: 36, borderRadius: "50%", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>
      )}

      {open && (
        <div className="chat-window" style={{
          position: "fixed",
          bottom: 88,
          left: windowLeft,
          right: windowRight,
          width: 340,
          maxWidth: "calc(100vw - 32px)",
          height: 480,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
          border: "1px solid #e8e6df",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 10000,
        }}>
          {/* Шапка */}
          <div style={{ padding: "11px 14px", background: "#1a1a18", color: "#fff", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {view !== "list" && (
              <button onClick={() => { setView("list"); setActiveConv(null); setMessages([]); setHasMore(false); }} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>←</button>
            )}
            <span style={{ fontWeight: 700, fontSize: 14, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {view === "list" && "💬 Чаты"}
              {view === "search" && "🔍 Новый чат"}
              {view === "dialog" && activeConv && (activeConv.id === "general" ? "🌐 Общий чат" : userName(interlocutor(activeConv)))}
            </span>
            <button onClick={toggleNotifyMode} title={notifyMode === "sound" ? "Звук включён" : "Без звука"} style={{ background: "none", border: "none", color: "#fff", fontSize: 16, cursor: "pointer", padding: "0 4px", opacity: notifyMode === "mute" ? 0.45 : 1 }}>
              {notifyMode === "sound" ? "🔔" : "🔕"}
            </button>
            {view === "list" && (
              <button onClick={() => { setView("search"); setSearchQ(""); }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>+ Новый</button>
            )}
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", lineHeight: 1, marginLeft: 4 }}>×</button>
          </div>

          {/* Список чатов */}
          {view === "list" && (
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" }}>
              <div onClick={() => openDialog("general")} style={{ padding: "10px 14px", borderBottom: "1px solid #f0ede8", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", background: "#fcfcfa" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#4a7aff", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 20, flexShrink: 0 }}>🌐</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a18" }}>Общий чат</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b6860", marginTop: 2 }}>Для всех сотрудников</div>
                </div>
                {hasNewGlobal && <div style={{ background: "#ef4444", borderRadius: "50%", width: 10, height: 10, flexShrink: 0 }} />}
              </div>

              {conversations.length === 0 && <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", marginTop: 60 }}>Нет личных диалогов.<br />Нажмите «+ Новый» чтобы начать</div>}

              {conversations.map(c => {
                const other = interlocutor(c);
                if (!other) return null;
                const last = c.messages?.[0];
                const initial = (other.firstName?.[0] ?? other.lastName?.[0] ?? other.email?.[0] ?? "?").toUpperCase();
                return (
                  <div key={c.id} onClick={() => openDialog(c)} style={{ padding: "10px 14px", borderBottom: "1px solid #f0ede8", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", background: "#fff", transition: "background 0.15s" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f4f0")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                    {other.avatarUrl ? (
                      <img src={other.avatarUrl} alt="ava" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid #e8e6df" }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: roleColor(other.role), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{initial}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userName(other)}</span>
                        {last && <span style={{ fontSize: 10, color: "#a8a49c", whiteSpace: "nowrap" }}>{formatLastMsgTime(last.createdAt)}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b6860", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                        {last ? (
                          <>
                            {last.senderId === currentUserId && <span style={{ color: last.readAt ? "#4a7aff" : "#a8a49c", fontSize: 11 }}>{last.readAt ? "✓✓" : "✓"}</span>}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{last.text ?? (last.mediaType === "image" ? "📷 Фото" : last.mediaType === "video" ? "🎥 Видео" : last.mediaType === "file" ? "📄 Документ" : "🎤 Голосовое")}</span>
                          </>
                        ) : <span style={{ color: "#a8a49c" }}>Нет сообщений</span>}
                      </div>
                    </div>
                    {c.unread > 0 && <div style={{ background: "#ef4444", color: "#fff", borderRadius: "50%", minWidth: 20, height: 20, padding: "0 6px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{c.unread > 9 ? "9+" : c.unread}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Поиск */}
          {view === "search" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #e8e6df", flexShrink: 0 }}>
                <input autoFocus value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Имя, телефон или email..." style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e8e6df", background: "#f5f4f0", outline: "none", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" }}>
                {searchResults.length === 0 && searchQ.length > 0 && <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", marginTop: 40 }}>Никого не найдено</div>}
                {searchResults.map(u => (
                  <div key={u.id} onClick={() => startChat(u)} style={{ padding: "10px 14px", borderBottom: "1px solid #f0ede8", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", background: "#fff", transition: "background 0.1s" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f4f0")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="ava" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 36, height: 36, borderRadius: "50%", background: roleColor(u.role), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{(u.firstName?.[0] ?? u.lastName?.[0] ?? u.email?.[0] ?? "?").toUpperCase()}</div>}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>{userName(u)}</div>
                      <div style={{ fontSize: 10, color: roleColor(u.role), fontWeight: 600 }}>{roleLabel(u.role)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Диалог */}
          {view === "dialog" && activeConv && (
            <>
              <div
                ref={chatBodyRef}
                onScroll={handleScroll}
                style={{ flex: 1, overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch", padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "#fafaf8", position: "relative" }}
              >
                {/* 🔥 Кнопка/индикатор подгрузки старых сообщений */}
                {loadingMore && (
                  <div style={{ textAlign: "center", padding: "6px 0", color: "#a8a49c", fontSize: 12 }}>
                    <span className="spinner" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #ccc", borderTopColor: "#4a7aff", borderRadius: "50%", marginRight: 6, verticalAlign: "middle" }} />
                    Загрузка...
                  </div>
                )}
                {hasMore && !loadingMore && (
                  <div style={{ textAlign: "center" }}>
                    <button onClick={loadMoreMessages} style={{ background: "none", border: "1px solid #e8e6df", borderRadius: 12, padding: "4px 14px", fontSize: 12, color: "#6b6860", cursor: "pointer" }}>↑ Показать раньше</button>
                  </div>
                )}

                {loading && (
                  <div style={{ position: "sticky", top: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(26, 26, 24, 0.8)", color: "#fff", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, zIndex: 100, alignSelf: "center", backdropFilter: "blur(4px)" }}>
                    <span className="spinner" style={{ width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%" }} />
                    Загрузка...
                  </div>
                )}

                {messages.length === 0 && <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center", margin: "auto" }}>Напишите первое сообщение</div>}

                {/* 🔥 Рендер сообщений с разделителями дат */}
                {withDateDividers(messages).map(item => {
                  if ("type" in item && item.type === "divider") {
                    return (
                      <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "#e8e6df" }} />
                        <span style={{ fontSize: 11, color: "#a8a49c", fontWeight: 600, whiteSpace: "nowrap" }}>{item.label}</span>
                        <div style={{ flex: 1, height: 1, background: "#e8e6df" }} />
                      </div>
                    );
                  }
                  const m = item as Message;
                  const isMe = m.sender.id === currentUserId;
                  const isGeneral = activeConv.id === "general";
                  // Группируем реакции по emoji
                  const reactionGroups: Record<string, string[]> = {};
                  if (m.reactions) {
                    for (const r of m.reactions) {
                      if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
                      reactionGroups[r.emoji].push(r.userId);
                    }
                  }
                  return (
                    <div key={m.id} style={{ alignSelf: isMe ? "flex-end" : "flex-start", maxWidth: "85%", display: "flex", gap: 8, alignItems: "flex-end", position: "relative" }}>
                      {!isMe && isGeneral && (
                        m.sender.avatarUrl ? (
                          <img src={m.sender.avatarUrl} alt="ava" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: roleColor(m.sender.role), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                            {(m.sender.firstName?.[0] || m.sender.lastName?.[0] || m.sender.email[0]).toUpperCase()}
                          </div>
                        )
                      )}
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {/* 🔥 Имя отправителя: во всех чатах — чужое имя, своё = "Я" */}
                        <div style={{ fontSize: 11, marginBottom: 2, marginLeft: isMe ? 0 : 4, marginRight: isMe ? 4 : 0, fontWeight: 600, color: isMe ? "#a8a49c" : roleColor(m.sender.role), textAlign: isMe ? "right" : "left" }}>
                          {isMe ? "Я" : userName(m.sender)}
                        </div>

                        {/* Пикер реакций — на десктопе через hover-кнопку 😊, на мобиле — longpress */}
                        <div style={{ position: "relative" }}
                          onTouchStart={() => startLongPress(m.id)}
                          onTouchEnd={cancelLongPress}
                          onTouchCancel={cancelLongPress}
                          onMouseEnter={() => setPickerMsgId(m.id)}
                          onMouseLeave={() => setPickerMsgId(null)}
                        >
                          {pickerMsgId === m.id && (
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{ position: "absolute", bottom: "100%", [isMe ? "right" : "left"]: 0, background: "#fff", border: "1px solid #e8e6df", borderRadius: 24, padding: "6px 10px", display: "flex", gap: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 200, marginBottom: 4, whiteSpace: "nowrap" }}>
                              {QUICK_EMOJIS.map(emoji => (
                                <button key={emoji}
                                  onClick={e => { e.stopPropagation(); handleReact(m.id, emoji, isGeneral); }}
                                  style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "2px 4px", borderRadius: 8, transition: "transform 0.1s" }}
                                  onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.3)")}
                                  onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                                >{emoji}</button>
                              ))}
                            </div>
                          )}
                          <div style={{ background: isMe ? "#1a1a18" : "#fff", color: isMe ? "#fff" : "#1a1a18", padding: "8px 12px", borderRadius: 14, borderBottomRightRadius: isMe ? 4 : 14, borderBottomLeftRadius: isMe ? 14 : 4, border: isMe ? "none" : "1px solid #e8e6df", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
                            {/* 🔥 Фото с кнопкой скачать */}
                            {m.mediaType === "image" && m.mediaUrl && (
                              <div style={{ position: "relative", marginBottom: m.text ? 6 : 0 }}>
                                <img src={m.mediaUrl} alt="Фото" onClick={() => setFullscreenImage(m.mediaUrl!)} style={{ width: "100%", borderRadius: 8, cursor: "zoom-in", display: "block" }} />
                                <button
                                  onClick={e => { e.stopPropagation(); forceDownload(m.mediaUrl!, "photo.jpg"); }}
                                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                                >📥</button>
                              </div>
                            )}
                            {m.mediaType === "video" && m.mediaUrl && <video controls src={m.mediaUrl} style={{ width: "100%", borderRadius: 8, marginBottom: m.text ? 6 : 0, maxHeight: 250, backgroundColor: "#000" }} />}
                            {m.mediaType === "audio" && m.mediaUrl && <audio controls src={m.mediaUrl} style={{ height: 36, width: 220, marginBottom: m.text ? 6 : 0 }} />}
                            {m.mediaType === "file" && m.mediaUrl && (
                              <div onClick={e => { e.preventDefault(); forceDownload(m.mediaUrl!, "document"); }} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: isMe ? "rgba(255,255,255,0.15)" : "#f5f4f0", padding: "8px 12px", borderRadius: 8, color: isMe ? "#fff" : "#1a1a18", marginBottom: m.text ? 6 : 0 }}>
                                <span style={{ fontSize: 24, flexShrink: 0 }}>📄</span>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600 }}>Документ / Файл</span>
                                  <span style={{ fontSize: 11, opacity: 0.8, textDecoration: "underline", color: isMe ? "#a5c2ff" : "#4a7aff" }}>Скачать файл</span>
                                </div>
                              </div>
                            )}
                            {m.text && <div style={{ fontSize: 14, lineHeight: 1.4, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{m.text}</div>}
                            <div style={{ fontSize: 10, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 4, color: isMe ? "rgba(255,255,255,0.5)" : "#a8a49c" }}>
                              <span>{new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>
                              {isMe && !isGeneral && <span style={{ color: m.readAt ? "#4a7aff" : "inherit", fontSize: 11 }}>{m.readAt ? "✓✓" : "✓"}</span>}
                            </div>
                          </div>
                        </div>
                        {/* Реакции под пузырём */}
                        {Object.keys(reactionGroups).length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, justifyContent: isMe ? "flex-end" : "flex-start" }}>
                            {Object.entries(reactionGroups).map(([emoji, users]) => {
                              const iMine = users.includes(currentUserId);
                              return (
                                <button key={emoji} onClick={() => handleReact(m.id, emoji, isGeneral)}
                                  style={{ background: iMine ? "#eef3ff" : "#f5f4f0", border: iMine ? "1px solid #4a7aff" : "1px solid #e8e6df", borderRadius: 12, padding: "2px 8px", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#1a1a18" }}>
                                  {emoji} <span style={{ fontSize: 11, fontWeight: 600 }}>{users.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {/* Поле ввода */}
              <div style={{ padding: 10, borderTop: "1px solid #e8e6df", display: "flex", gap: 8, background: "#fff", flexShrink: 0, alignItems: "flex-end" }}>
                <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileUpload} />
                <button onClick={() => fileInputRef.current?.click()} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: "6px 4px", opacity: loading || isRecording ? 0.5 : 1 }} disabled={loading || isRecording}>📎</button>
                {isRecording ? (
                  <div style={{ flex: 1, color: "#ef4444", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, paddingLeft: 8, height: 38 }}>
                    <span className="record-dot" style={{ width: 10, height: 10, background: "#ef4444", borderRadius: "50%", display: "inline-block" }} />
                    Идет запись...
                  </div>
                ) : (
                  <textarea className="chat-textarea" ref={textareaRef} value={text} onChange={handleTextChange}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    onPaste={handlePaste} placeholder="Сообщение (Shift+Enter)..." disabled={loading} rows={1}
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 20, border: "1px solid #e8e6df", background: "#f5f4f0", outline: "none", fontSize: 14, resize: "none", minHeight: 40, maxHeight: 120, boxSizing: "border-box", fontFamily: "inherit" }}
                  />
                )}
                {text.trim() ? (
                  <button onClick={() => send()} disabled={loading} style={{ background: "#4a7aff", color: "#fff", border: "none", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: loading ? 0.5 : 1, flexShrink: 0, paddingLeft: 4 }}>➤</button>
                ) : (
                  <button onClick={toggleRecording} disabled={loading} style={{ background: isRecording ? "#ef4444" : "#f5f4f0", color: isRecording ? "#fff" : "#1a1a18", border: isRecording ? "none" : "1px solid #e8e6df", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 18, cursor: "pointer", opacity: loading ? 0.5 : 1, flexShrink: 0 }}>
                    {isRecording ? "⏹" : "🎤"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 🔥 Кнопка: у курьера скрыта (у него чат в навбаре), у оператора — левый нижний угол */}
      {!isCourier && (
        <button
          onClick={() => setOpen(v => !v)}
          style={{ position: "fixed", bottom: 24, left: 24, width: 56, height: 56, borderRadius: "50%", background: "#1a1a18", color: "#fff", border: "none", fontSize: 24, cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, transition: "transform 0.2s" }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(0.95)"}
          onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
        >
          {open ? "×" : "💬"}
          {!open && (totalUnread > 0 || hasNewGlobal) && (
            <span style={{ position: "absolute", top: 4, right: 4, background: "#ef4444", color: "#fff", borderRadius: "50%", minWidth: 20, height: 20, padding: "0 5px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #1a1a18" }}>
              {(totalUnread + (hasNewGlobal ? 1 : 0)) > 9 ? "9+" : (totalUnread + (hasNewGlobal ? 1 : 0))}
            </span>
          )}
        </button>
      )}
    </>
  );
}