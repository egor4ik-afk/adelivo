// src/app/courier/profile/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { usePushNotifications } from "@/components/usePushNotifications";
import { IMaskInput } from "react-imask";

interface Profile {
  id: string; 
  email: string; 
  firstName: string | null; 
  lastName: string | null; 
  phone: string | null;
  homeAddress: string | null; 
  isAuto: boolean; // 🔥 ДОБАВЛЕНО
}

interface Stats {
  weekCount: number;
  weekTotal: number;
  allTimeCount: number;
  allTimeTotal: number;
  konsolPhone: string | null;
  isLinked: boolean;
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
      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #4a7aff", outline: "none", fontSize: 14, boxSizing: "border-box", display: "block" }} 
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
  const [isAuto, setIsAuto] = useState(false); // 🔥 ДОБАВЛЕНО Состояние для авто
  
  // Консоль
  const [konsolModalOpen, setKonsolModalOpen] = useState(false);
  const [inputKonsolPhone, setInputKonsolPhone] = useState("");
  const [konsolLoading, setKonsolLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [myShifts, setMyShifts] = useState<string[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pwaPrompt, setPwaPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(true);

  const { state: pushState, subscribe, unsubscribe } = usePushNotifications();
  const isSubscribed = pushState === "granted";
  const needsPushBanner = pushState === "default";

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return {
      date: d.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }),
      dayName: d.toLocaleDateString("ru-RU", { weekday: "short" }),
      dayNum: d.getDate()
    };
  });

  const loadData = () => {
    fetch("/api/profile").then(r => r.json()).then(data => {
      setProfile(data);
      setNewPhone(data.phone || "");
      setNewFirstName(data.firstName || "");
      setNewLastName(data.lastName || "");
      setNewHomeAddress(data.homeAddress || "");
      setIsAuto(data.isAuto || false); // 🔥 ЗАГРУЖАЕМ статус авто
    });

    fetch("/api/courier/my-stats").then(r => r.json()).then(data => {
      setStats(data);
    });

    fetch("/api/courier/my-shifts").then(r => r.json()).then(data => {
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

  const toggleShift = async (date: string) => {
    const isWorking = !myShifts.includes(date);
    setMyShifts(prev => isWorking ? [...prev, date] : prev.filter(d => d !== date));

    try {
      await fetch("/api/courier/my-shifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, isWorking })
      });
    } catch (e) {
      alert("Ошибка сохранения смены. Проверьте интернет.");
      setMyShifts(prev => !isWorking ? [...prev, date] : prev.filter(d => d !== date));
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const cleanPhone = newPhone.replace(/[^\d+]/g, "");

    try {
      await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        // 🔥 ОТПРАВЛЯЕМ isAuto
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

  // 🔥 Функция для мгновенного сохранения статуса Авто без кнопки "Сохранить"
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
      alert("Не удалось обновить статус Авто");
      setIsAuto(!newStatus);
      setProfile(prev => prev ? { ...prev, isAuto: !newStatus } : null);
    }
  };

  const handleKonsolAction = async (action: "link" | "unlink") => {
    setKonsolLoading(true);
    const phonePayload = action === "link" ? inputKonsolPhone.replace(/[^\d+]/g, "") : "";
  
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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

    try {
      await subscribe();
    } catch (error) {
      alert("Браузер заблокировал уведомления. Убедитесь, что вы разрешили их в настройках сайта.");
    }
  };

  const installPWA = async () => {
    if (!pwaPrompt) {
      alert("Для установки на iPhone нажмите «Поделиться» ⍐ в браузере и выберите «На экран Домой» ➕.\n\nНа Android включите установку в настройках браузера.");
      return;
    }
    pwaPrompt.prompt();
    await pwaPrompt.userChoice;
    setPwaPrompt(null);
  };

  if (!profile) return <div style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка профиля...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f4f0", overflowY: "auto", paddingBottom: 80 }}>

      <div style={{ padding: "24px 16px", background: "#fff", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #e8e6df" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#4a7aff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
          {(profile.firstName?.[0] || "") + (profile.lastName?.[0] || "")}
        </div>
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

        {/* 🔥 НОВЫЙ ПЕРЕКЛЮЧАТЕЛЬ АВТО/ПЕШИЙ */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18" }}>Тип курьера</div>
            <div style={{ fontSize: 12, color: "#6b6860", marginTop: 2 }}>{isAuto ? "Автомобиль (+100₽ к доставке)" : "Пеший / Авто"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", background: "#f5f4f0", borderRadius: 8, padding: 4 }}>
            <button 
              onClick={toggleAutoStatus} 
              style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: !isAuto ? "#fff" : "transparent", color: !isAuto ? "#1a1a18" : "#a8a49c", boxShadow: !isAuto ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.2s" }}
            >
              🚶 Пеший
            </button>
            <button 
              onClick={toggleAutoStatus} 
              style={{ padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: isAuto ? "#10b981" : "transparent", color: isAuto ? "#fff" : "#a8a49c", boxShadow: isAuto ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.2s" }}
            >
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

            {/* ИНТЕГРАЦИЯ С КОНСОЛЬЮ */}
            <div style={{ padding: 12, background: stats.isLinked ? "#eef3ff" : "#fef2f2", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: stats.isLinked ? "#4a7aff" : "#d94040" }}>
                  {stats.isLinked ? "✅ Консоль подключена" : "❌ Самозанятость не указана"}
                </div>
                <div style={{ fontSize: 11, color: "#6b6860", marginTop: 2 }}>
                  {stats.isLinked ? `Выплаты на: ${stats.konsolPhone}` : "Налоги +6% не начисляются"}
                </div>
              </div>
              <button 
                onClick={() => stats.isLinked ? handleKonsolAction("unlink") : setKonsolModalOpen(true)}
                style={{ background: stats.isLinked ? "transparent" : "#1a1a18", border: stats.isLinked ? "1px solid #4a7aff" : "none", color: stats.isLinked ? "#4a7aff" : "#fff", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {stats.isLinked ? "Отвязать" : "Привязать"}
              </button>
            </div>
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase" }}>График (Ближайшие 7 дней)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {days.map((d, i) => {
              const isWorking = myShifts.includes(d.date);
              return (
                <div
                  key={d.date}
                  onClick={() => toggleShift(d.date)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0",
                    borderRadius: 8, cursor: "pointer", transition: "all 0.2s",
                    background: isWorking ? "#10b981" : "#f5f4f0",
                    color: isWorking ? "#fff" : "#1a1a18",
                    border: i === 0 && !isWorking ? "1px solid #1a1a18" : "1px solid transparent"
                  }}
                >
                  <span style={{ fontSize: 11, textTransform: "uppercase", opacity: isWorking ? 0.9 : 0.5, fontWeight: 600 }}>{d.dayName}</span>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{d.dayNum}</span>
                </div>
              );
            })}
          </div>
        </div>

        {!isStandalone && (
          <div
            onClick={installPWA}
            style={{
              margin: "0 0 16px 0", padding: "14px 16px",
              background: "linear-gradient(135deg, #38bdf8 0%, #4a7aff 100%)",
              borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
              WebkitTapHighlightColor: "transparent", boxShadow: "0 4px 12px rgba(74,122,255,0.2)"
            }}
          >
            <span style={{ fontSize: 24, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}>📱</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Установить приложение</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, lineHeight: 1.3 }}>
                Для быстрой работы без адресной строки и поддержки Push
              </div>
            </div>
            <span style={{ color: "#fff", fontSize: 20, fontWeight: 300 }}>›</span>
          </div>
        )}

        {needsPushBanner && (
          <div
            onClick={handleSubscribe}
            style={{
              margin: "0 0 16px 0", padding: "14px 16px",
              background: "linear-gradient(135deg, #1a1a18 0%, #2d2d2a 100%)",
              borderRadius: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
              WebkitTapHighlightColor: "transparent"
            }}
          >
            <span style={{ fontSize: 24 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Включить уведомления</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                Нажмите чтобы получать уведомления о маршрутах
              </div>
            </div>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 20 }}>›</span>
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase" }}>Настройки</h2>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid #f0efe9" }}>
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
                    <input value={newFirstName} onChange={e => setNewFirstName(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #4a7aff", outline: "none", fontSize: 14, boxSizing: "border-box", display: "block" }} />
                  </div>
                  <div style={{ width: "100%" }}>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 4 }}>Фамилия</div>
                    <input value={newLastName} onChange={e => setNewLastName(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #4a7aff", outline: "none", fontSize: 14, boxSizing: "border-box", display: "block" }} />
                  </div>
                  <div style={{ width: "100%" }}>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 4 }}>Телефон</div>
                    <IMaskInput
                      mask="+7 (000) 000-00-00"
                      value={newPhone}
                      onAccept={(value: string) => setNewPhone(value)}
                      placeholder="+7 (___) ___-__-__"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #4a7aff", outline: "none", fontSize: 14, boxSizing: "border-box", display: "block" }}
                    />
                  </div>
                  
                  <div style={{ width: "100%" }}>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 4 }}>Домашний адрес (Город, Улица, Дом)</div>
                    <AddressSuggestInput value={newHomeAddress} onChange={setNewHomeAddress} />
                  </div>
                </div>
              )}
            </div>
            
            {!editingProfile ? (
              <button onClick={() => setEditingProfile(true)} style={{ background: "none", border: "none", color: "#4a7aff", fontSize: 13, fontWeight: 600, padding: "10px 0", cursor: "pointer", marginLeft: "auto", marginTop: 8 }}>Изменить</button>
            ) : (
              <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button onClick={handleSaveProfile} disabled={saving} style={{ background: "#4a7aff", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  {saving ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>
            )}
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
                <input
                  type="checkbox"
                  checked={isSubscribed}
                  onChange={isSubscribed ? unsubscribe : handleSubscribe}
                  style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                />
                <span style={{
                  position: "absolute", inset: 0, borderRadius: 24,
                  background: isSubscribed ? "#10b981" : "#d1d5db",
                  transition: "background 0.2s"
                }} />
                <span style={{
                  position: "absolute", top: 3, left: isSubscribed ? 23 : 3,
                  width: 18, height: 18, borderRadius: "50%", background: "#fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.2)", transition: "left 0.2s"
                }} />
              </label>
            )}
          </div>
        </div>

        <button onClick={handleLogout} style={{ width: "100%", background: "rgba(217,64,64,0.08)", color: "#d94040", border: "1px solid rgba(217,64,64,0.2)", padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Выйти из аккаунта
        </button>

      </div>

      {/* Модалка Консоли */}
      {konsolModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", padding: 24, borderRadius: 20, width: "90%", maxWidth: 350 }}>
            <h3 style={{ margin: "0 0 8px 0", fontSize: 18, color: "#1a1a18" }}>Привязка Консоль.Про</h3>
            <p style={{ fontSize: 13, color: "#6b6860", margin: "0 0 16px 0", lineHeight: 1.4 }}>
              Введите номер телефона, на который оформлен ваш статус самозанятого.
            </p>
            <IMaskInput
              mask="+7 (000) 000-00-00"
              value={inputKonsolPhone}
              onAccept={(val) => setInputKonsolPhone(val as string)}
              placeholder="+7 (___) ___-__-__"
              style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #4a7aff", outline: "none", fontSize: 16, boxSizing: "border-box", display: "block", marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setKonsolModalOpen(false)} style={{ flex: 1, padding: 12, background: "#f5f4f0", color: "#1a1a18", border: "none", borderRadius: 8, fontWeight: 600 }}>Отмена</button>
              <button onClick={() => handleKonsolAction("link")} disabled={konsolLoading} style={{ flex: 1, padding: 12, background: "#4a7aff", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600 }}>
                {konsolLoading ? "Проверка..." : "Привязать"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}