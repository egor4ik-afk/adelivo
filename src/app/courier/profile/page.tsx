// src/app/courier/profile/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { usePushNotifications } from "@/components/usePushNotifications";
import { IMaskInput } from "react-imask";
import imageCompression from "browser-image-compression"; // 🔥 Добавили для сжатия

interface Profile {
  id: string; 
  email: string; 
  firstName: string | null; 
  lastName: string | null; 
  phone: string | null;
  homeAddress: string | null; 
  isAuto: boolean;
  avatarUrl?: string | null; // 🔥 Добавлено поле аватарки
}

interface Stats {
  weekCount: number;
  weekTotal: number;
  allTimeCount: number;
  allTimeTotal: number;
  konsolPhone: string | null;
  isLinked: boolean;
}

const TIME_OPTIONS: string[] = [];
for (let i = 6; i <= 23; i++) {
  TIME_OPTIONS.push(`${String(i).padStart(2, '0')}:00`);
  TIME_OPTIONS.push(`${String(i).padStart(2, '0')}:30`);
}

function AddressSuggestInput({ value, onChange }: { value: string, onChange: (val: string) => void }) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const inputId = "profile-home-address";

    const init = () => {
      (window as any).ymaps.ready(() => {
        const input = document.getElementById(inputId);
        if (!input || (input as any).isSuggestInitialized) return;
        try {
          const suggest = new (window as any).ymaps.SuggestView(inputId, { results: 5 });
          suggest.events.add("select", (e: any) => {
            onChangeRef.current(e.get("item").value);
          });
          (input as any).isSuggestInitialized = true;
        } catch (err) {
          console.warn("Suggest error:", err);
        }
      });
    };

    const waitAndInit = () => {
      const interval = setInterval(() => {
        if ((window as any).ymaps && typeof (window as any).ymaps.SuggestView === "function") {
          clearInterval(interval);
          init();
        }
      }, 200);
      setTimeout(() => clearInterval(interval), 8000);
    };

    const existingScript = document.querySelector('script[src*="api-maps.yandex.ru"]');

    if ((window as any).ymaps || existingScript) {
      waitAndInit();
    } else {
      const script = document.createElement("script");
      const mapsKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY || "";
      const suggestKey = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_KEY || mapsKey;
      script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${mapsKey}&suggest_apikey=${suggestKey}&load=package.full`;
      script.onload = waitAndInit;
      document.head.appendChild(script);
    }
  }, []);

  return (
    <input 
      id="profile-home-address" 
      value={value} 
      onChange={e => onChangeRef.current(e.target.value)} 
      placeholder="Москва, ул. Пушкина, д. 1" 
      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #4a7aff", outline: "none", fontSize: 15, boxSizing: "border-box", display: "block" }} 
    />
  );
}

export default function CourierProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  
  const [newPhone, setNewPhone] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newHomeAddress, setNewHomeAddress] = useState(""); 
  const [isAuto, setIsAuto] = useState(false); 
  
  const [konsolModalOpen, setKonsolModalOpen] = useState(false);
  const [inputKonsolPhone, setInputKonsolPhone] = useState("");
  const [konsolLoading, setKonsolLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [myShifts, setMyShifts] = useState<any[]>([]);

  // 🔥 Загрузка аватарки
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pwaPrompt, setPwaPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(true);

  const { state: pushState, subscribe, unsubscribe } = usePushNotifications();
  const isSubscribed = pushState === "granted";

  const scheduleDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); 
    return d.toISOString().split("T")[0];
  });

  const loadData = () => {
    fetch("/api/profile").then(r => r.json()).then(data => {
      setProfile(data);
      setNewPhone(data.phone || "");
      setNewFirstName(data.firstName || "");
      setNewLastName(data.lastName || "");
      setNewHomeAddress(data.homeAddress || "");
      setIsAuto(data.isAuto || false);
    });

    fetch("/api/courier/my-stats").then(r => r.json()).then(data => {
      setStats(data);
    });

    const from = scheduleDates[0];
    const to = scheduleDates[6];
    fetch(`/api/courier/my-shifts?from=${from}&to=${to}`).then(r => r.json()).then(data => {
      if (Array.isArray(data)) setMyShifts(data);
    });
  };

  useEffect(() => {
    loadData();

    const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in window.navigator && (window.navigator as any).standalone);
    setIsStandalone(standalone);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPwaPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  // 🔥 Логика загрузки фото
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploadingAvatar(true);
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 500, useWebWorker: true });
      const presignRes = await fetch("/api/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `avatar-courier-${profile.id}-${Date.now()}.jpg`, contentType: compressed.type }),
      });

      if (!presignRes.ok) throw new Error("Upload failed");
      const { uploadUrl, fileUrl } = await presignRes.json();
      await fetch(uploadUrl, { method: "PUT", body: compressed, headers: { "Content-Type": compressed.type } });

      await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: fileUrl })
      });

      setProfile(p => ({ ...p!, avatarUrl: fileUrl }));
    } catch (err) {
      alert("Ошибка при загрузке фото.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateShift = async (date: string, data: { isWorking: boolean, startTime?: string, endTime?: string }) => {
    if (data.isWorking) {
      setMyShifts(prev => {
        const existing = prev.find(s => s.date === date);
        if (existing) return prev.map(s => s.date === date ? { ...s, ...data } : s);
        return [...prev, { date, startTime: data.startTime || "10:00", endTime: data.endTime || "22:00" }];
      });
    } else {
      setMyShifts(prev => prev.filter(s => s.date !== date));
    }

    try {
      await fetch("/api/courier/my-shifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, ...data })
      });
    } catch (e) {
      alert("Ошибка сохранения смены. Проверьте интернет.");
      loadData(); 
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const cleanPhone = newPhone.replace(/[^\d+]/g, "");

    try {
      await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, firstName: newFirstName, lastName: newLastName, homeAddress: newHomeAddress, isAuto })
      });
      loadData();
      setEditingProfile(false);
    } catch (e) {
      alert("Не удалось сохранить данные");
    } finally {
      setSaving(false);
    }
  };

  const toggleAutoStatus = async () => {
    const newStatus = !isAuto;
    setIsAuto(newStatus);
    setProfile(prev => prev ? { ...prev, isAuto: newStatus } : null);

    try {
      await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAuto: newStatus })
      });
    } catch (e) {
      setIsAuto(!newStatus);
      setProfile(prev => prev ? { ...prev, isAuto: !newStatus } : null);
    }
  };

  const handleKonsolAction = async (action: "link" | "unlink") => {
    setKonsolLoading(true);
    const phonePayload = action === "link" ? inputKonsolPhone.replace(/[^\d+]/g, "") : "";
  
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ konsolPhone: phonePayload }),
      });
      const data = await res.json();
  
      if (data.error) {
        alert(data.error);
      } else if (data.invited) {
        setKonsolModalOpen(false);
        alert(`📲 Приглашение отправлено на ${inputKonsolPhone}!\n\nСсылка для регистрации:\n${data.onboarding_url}`);
        loadData();
      } else {
        setKonsolModalOpen(false);
        loadData();
      }
    } catch (e) {
      alert("Ошибка сервера при сохранении СЗ");
    } finally {
      setKonsolLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleSubscribe = async () => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    if (isIOS && !isStandalone) {
      alert("На iPhone уведомления работают только в установленном приложении.\n\nНажмите кнопку «Поделиться» ⍐ в браузере, а затем «На экран Домой» ➕.");
      return;
    }
    try { await subscribe(); } catch (error) { alert("Браузер заблокировал уведомления."); }
  };

  const installPWA = async () => {
    if (!pwaPrompt) return;
    pwaPrompt.prompt();
    await pwaPrompt.userChoice;
    setPwaPrompt(null);
  };

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("ru", { weekday: "short", day: "2-digit", month: "long" });
  };

  if (!profile) return <div style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка профиля...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f4f0", overflowY: "auto", paddingBottom: 80 }}>

      <div style={{ padding: "24px 16px", background: "#fff", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #e8e6df" }}>
        
        {/* БЛОК АВАТАРКИ */}
        <div style={{ position: "relative", cursor: "pointer" }} onClick={() => fileInputRef.current?.click()}>
          {uploadingAvatar ? (
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#e8e6df", display: "flex", alignItems: "center", justifyContent: "center" }}>⏳</div>
          ) : profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="Avatar" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid #e8e6df" }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#4a7aff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
              {(profile.firstName?.[0] || "") + (profile.lastName?.[0] || "")}
            </div>
          )}
          <div style={{ position: "absolute", bottom: -2, right: -4, background: "#fff", borderRadius: "50%", padding: 4, boxShadow: "0 2px 5px rgba(0,0,0,0.2)", fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            📷
          </div>
        </div>
        <input type="file" ref={fileInputRef} style={{ display: "none" }} accept="image/*" onChange={handleAvatarUpload} />

        <div style={{ flex: 1, overflow: "hidden" }}>
          <h1 style={{ margin: 0, fontSize: 20, color: "#1a1a18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {profile.firstName} {profile.lastName}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#a8a49c", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Курьер • {profile.email}
          </p>
        </div>
      </div>

      <div style={{ padding: 16 }}>

        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18" }}>Тип курьера</div>
            <div style={{ fontSize: 12, color: "#6b6860", marginTop: 2 }}>{isAuto ? "Автомобиль (+100₽ к доставке)" : "Пеший / Авто"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", background: "#f5f4f0", borderRadius: 8, padding: 4 }}>
            <button onClick={toggleAutoStatus} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: !isAuto ? "#fff" : "transparent", color: !isAuto ? "#1a1a18" : "#a8a49c", boxShadow: !isAuto ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.2s" }}>
              🚶 Пеший
            </button>
            <button onClick={toggleAutoStatus} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: isAuto ? "#10b981" : "transparent", color: isAuto ? "#fff" : "#a8a49c", boxShadow: isAuto ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.2s" }}>
              🚗 Авто
            </button>
          </div>
        </div>

        {stats && (
          <div style={{ background: "#fff", padding: 16, borderRadius: 12, marginBottom: 16, border: "1px solid #e8e6df", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase" }}>Статистика (СЗ +6%)</h2>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ background: "#f0fdf4", padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: "#10b981", textTransform: "uppercase", fontWeight: 700 }}>Эта неделя</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a18", marginTop: 4 }}>{stats.weekTotal} ₽</div>
                <div style={{ fontSize: 12, color: "#6b6860" }}>{stats.weekCount} заказов</div>
              </div>
              <div style={{ background: "#fafaf8", padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", fontWeight: 700 }}>Всё время</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a18", marginTop: 4 }}>{stats.allTimeTotal} ₽</div>
                <div style={{ fontSize: 12, color: "#6b6860" }}>{stats.allTimeCount} заказов</div>
              </div>
            </div>

            <div style={{ padding: 12, background: stats.isLinked ? "#eef3ff" : "#fef2f2", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: stats.isLinked ? "#4a7aff" : "#d94040" }}>
                  {stats.isLinked ? "✅ Консоль подключена" : "❌ Самозанятость не указана"}
                </div>
                <div style={{ fontSize: 11, color: "#6b6860", marginTop: 2 }}>
                  {stats.isLinked ? `Выплаты на: ${stats.konsolPhone}` : "Налоги +6% не начисляются"}
                </div>
              </div>
              <button onClick={() => stats.isLinked ? handleKonsolAction("unlink") : setKonsolModalOpen(true)} style={{ background: stats.isLinked ? "transparent" : "#1a1a18", border: stats.isLinked ? "1px solid #4a7aff" : "none", color: stats.isLinked ? "#4a7aff" : "#fff", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {stats.isLinked ? "Отвязать" : "Привязать"}
              </button>
            </div>
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase" }}>📅 График работы</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scheduleDates.map(date => {
              const shift = myShifts.find(s => s.date === date);
              const isWorking = !!shift;

              return (
                <div key={date} style={{ background: isWorking ? "#f0fdf4" : "#fafaf8", padding: "14px 16px", borderRadius: 12, border: isWorking ? "1px solid #a7f3d0" : "1px solid #e8e6df", transition: "all 0.2s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18", textTransform: "capitalize" }}>
                      {formatDay(date)}
                    </span>
                    
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isWorking ? "#10b981" : "#a8a49c" }}>
                        {isWorking ? "На смене" : "Выходной"}
                      </span>
                      <input type="checkbox" checked={isWorking} onChange={(e) => updateShift(date, { isWorking: e.target.checked, startTime: shift?.startTime || "10:00", endTime: shift?.endTime || "22:00" })} style={{ width: 20, height: 20, accentColor: "#10b981" }} />
                    </label>
                  </div>

                  {isWorking && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, paddingTop: 14, borderTop: "1px solid #d1fae5", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "#059669", fontWeight: 600, flex: 1 }}>Часы работы:</span>
                      
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <select value={shift.startTime || "10:00"} onChange={(e) => updateShift(date, { isWorking: true, startTime: e.target.value, endTime: shift.endTime })} style={{ width: "80px", padding: "6px 4px", borderRadius: 8, border: "1px solid #a7f3d0", outline: "none", fontSize: 16, background: "#fff", color: "#065f46", fontWeight: 700, textAlign: "center" }}>
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span style={{ color: "#059669", fontWeight: 700 }}>-</span>
                        <select value={shift.endTime || "22:00"} onChange={(e) => updateShift(date, { isWorking: true, startTime: shift.startTime, endTime: e.target.value })} style={{ width: "80px", padding: "6px 4px", borderRadius: 8, border: "1px solid #a7f3d0", outline: "none", fontSize: 16, background: "#fff", color: "#065f46", fontWeight: 700, textAlign: "center" }}>
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
          <div>
            <div style={{ fontSize: 13, color: "#a8a49c" }}>Push-уведомления</div>
            <div style={{ fontSize: 13, color: isSubscribed ? "#10b981" : "#d94040", marginTop: 4, fontWeight: 600 }}>
              {pushState === "loading" ? "..." : pushState === "unsupported" ? "Не поддерживается" : isSubscribed ? "Включены" : "Выключены"}
            </div>
          </div>
          {pushState !== "unsupported" && pushState !== "loading" && (
            <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer", touchAction: "manipulation" }}>
              <input type="checkbox" checked={isSubscribed} onChange={isSubscribed ? unsubscribe : handleSubscribe} style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: 24, background: isSubscribed ? "#10b981" : "#d1d5db", transition: "background 0.2s" }} />
              <span style={{ position: "absolute", top: 3, left: isSubscribed ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transition: "left 0.2s" }} />
            </label>
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase" }}>Настройки</h2>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0" }}>
            <div style={{ flex: "1 1 100%", paddingRight: 0, display: "flex", flexDirection: "column", width: "100%" }}>              
              {!editingProfile ? (
                <>
                  <div style={{ fontSize: 13, color: "#a8a49c" }}>Личные данные</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a18", marginTop: 4 }}>
                    {profile.firstName} {profile.lastName}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a18", marginTop: 4 }}>
                    {profile.phone || "Телефон не указан"}
                  </div>
                  
                  <div style={{ fontSize: 13, color: "#a8a49c", marginTop: 12 }}>Домашний адрес (для карты)</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a18", marginTop: 2, wordBreak: "break-word" }}>
                    {profile.homeAddress || "Не указан"}
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
                  <div style={{ width: "100%" }}>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 4 }}>Имя</div>
                    <input value={newFirstName} onChange={e => setNewFirstName(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #4a7aff", outline: "none", fontSize: 15, boxSizing: "border-box", display: "block" }} />
                  </div>
                  <div style={{ width: "100%" }}>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 4 }}>Фамилия</div>
                    <input value={newLastName} onChange={e => setNewLastName(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #4a7aff", outline: "none", fontSize: 15, boxSizing: "border-box", display: "block" }} />
                  </div>
                  <div style={{ width: "100%" }}>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 4 }}>Телефон</div>
                    <IMaskInput mask="+7 (000) 000-00-00" value={newPhone} onAccept={(value: string) => setNewPhone(value)} placeholder="+7 (___) ___-__-__" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #4a7aff", outline: "none", fontSize: 15, boxSizing: "border-box", display: "block" }} />
                  </div>
                  <div style={{ width: "100%" }}>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 4 }}>Домашний адрес (Город, Улица, Дом)</div>
                    <AddressSuggestInput value={newHomeAddress} onChange={setNewHomeAddress} />
                  </div>
                </div>
              )}
            </div>
            
            {!editingProfile ? (
              <button onClick={() => setEditingProfile(true)} style={{ background: "none", border: "none", color: "#4a7aff", fontSize: 14, fontWeight: 700, padding: "10px 0", cursor: "pointer", marginLeft: "auto", marginTop: 8 }}>Изменить</button>
            ) : (
              <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button onClick={handleSaveProfile} disabled={saving} style={{ background: "#4a7aff", border: "none", color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>
            )}
          </div>
        </div>

        {!isStandalone && (
          <div onClick={installPWA} style={{ margin: "0 0 16px 0", padding: "14px 16px", background: "linear-gradient(135deg, #38bdf8 0%, #4a7aff 100%)", borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, WebkitTapHighlightColor: "transparent", boxShadow: "0 4px 12px rgba(74,122,255,0.2)" }}>
            <span style={{ fontSize: 24, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}>📱</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Установить приложение</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, lineHeight: 1.3 }}>Для быстрой работы без адресной строки и поддержки Push</div>
            </div>
            <span style={{ color: "#fff", fontSize: 20, fontWeight: 300 }}>›</span>
          </div>
        )}

        <button onClick={handleLogout} style={{ width: "100%", background: "rgba(217,64,64,0.08)", color: "#d94040", border: "1px solid rgba(217,64,64,0.2)", padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Выйти из аккаунта
        </button>

      </div>

      {konsolModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", padding: 24, borderRadius: 20, width: "90%", maxWidth: 350 }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 18, color: "#1a1a18" }}>Привязка Консоль.Про</h3>
            <p style={{ fontSize: 13, color: "#6b6860", margin: "0 0 16px 0", lineHeight: 1.4 }}>Введите номер телефона, на который оформлен ваш статус самозанятого.</p>
            <IMaskInput mask="+7 (000) 000-00-00" value={inputKonsolPhone} onAccept={(val) => setInputKonsolPhone(val as string)} placeholder="+7 (___) ___-__-__" style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #4a7aff", outline: "none", fontSize: 16, boxSizing: "border-box", display: "block", marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setKonsolModalOpen(false)} style={{ flex: 1, padding: 12, background: "#f5f4f0", color: "#1a1a18", border: "none", borderRadius: 8, fontWeight: 600 }}>Отмена</button>
              <button onClick={() => handleKonsolAction("link")} disabled={konsolLoading} style={{ flex: 1, padding: 12, background: "#4a7aff", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600 }}>{konsolLoading ? "Проверка..." : "Привязать"}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}