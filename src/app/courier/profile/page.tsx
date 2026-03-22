// src/app/courier/profile/page.tsx
"use client";
import { useState, useEffect } from "react";
import { usePushNotifications } from "@/components/usePushNotifications";

interface Profile {
  id: string; email: string; firstName: string | null; lastName: string | null; phone: string | null;
}

export default function CourierProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [myShifts, setMyShifts] = useState<string[]>([]);

  // Хук для Push-уведомлений
  const { state: pushState, subscribe, unsubscribe } = usePushNotifications();
  const isSubscribed = pushState === "granted";

  // Генерация ближайших 7 дней для графика
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return { 
      date: d.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }), 
      dayName: d.toLocaleDateString("ru-RU", { weekday: "short" }), 
      dayNum: d.getDate() 
    };
  });

  useEffect(() => {
    // 1. Грузим профиль
    fetch("/api/profile").then(r => r.json()).then(data => {
      setProfile(data);
      setNewPhone(data.phone || "");
    });

    // 2. Грузим реальные смены курьера
    fetch("/api/courier/my-shifts").then(r => r.json()).then(data => {
      if (Array.isArray(data)) setMyShifts(data);
    });
  }, []);

  const toggleShift = async (date: string) => {
    const isWorking = !myShifts.includes(date);
    
    // Оптимистичное обновление UI (сразу красим кнопку)
    setMyShifts(prev => isWorking ? [...prev, date] : prev.filter(d => d !== date));
    
    try {
      await fetch("/api/courier/my-shifts", {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, isWorking })
      });
    } catch (e) {
      // Откатываем если ошибка сервера
      alert("Ошибка сохранения смены. Проверьте интернет.");
      setMyShifts(prev => !isWorking ? [...prev, date] : prev.filter(d => d !== date));
    }
  };

  const handleSavePhone = async () => {
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: newPhone })
      });
      setProfile(p => p ? { ...p, phone: newPhone } : null);
      setEditingPhone(false);
    } catch (e) {
      alert("Не удалось сохранить телефон");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    document.cookie = "flowerops_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  };

  // 🔥 Безопасное включение Push с перехватом ошибок мобильных браузеров
  const handleSubscribe = async () => {
    try {
      await subscribe();
    } catch (error) {
      alert("Браузер заблокировал уведомления. Убедитесь, что вы разрешили их в настройках сайта.");
      console.error("Push subscribe error:", error);
    }
  };

  if (!profile) return <div style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка профиля...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f4f0", overflowY: "auto", paddingBottom: 80 }}>
      
      <div style={{ padding: "24px 16px", background: "#fff", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #e8e6df" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#4a7aff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>
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
        
        {/* Блок Графика работы (теперь 7 дней) */}
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

        {/* Настройки и контакты */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase" }}>Настройки</h2>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0efe9" }}>
            <div style={{ flex: 1, paddingRight: 16 }}>
              <div style={{ fontSize: 13, color: "#a8a49c" }}>Номер телефона</div>
              {!editingPhone && <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a18", marginTop: 4 }}>{profile.phone || "Не указан"}</div>}
              {editingPhone && <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #4a7aff", outline: "none", fontSize: 14, marginTop: 4, boxSizing: "border-box" }} />}
            </div>
            {!editingPhone ? (
              <button onClick={() => setEditingPhone(true)} style={{ background: "none", border: "none", color: "#4a7aff", fontSize: 13, fontWeight: 600, padding: "10px 0", cursor: "pointer" }}>Изменить</button>
            ) : (
              <button onClick={handleSavePhone} disabled={saving} style={{ background: "#4a7aff", border: "none", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{saving ? "..." : "Сохранить"}</button>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
            <div>
              <div style={{ fontSize: 13, color: "#a8a49c" }}>Push-уведомления</div>
              <div style={{ fontSize: 13, color: isSubscribed ? "#10b981" : "#d94040", marginTop: 4, fontWeight: 600 }}>
                {isSubscribed ? "Включены" : "Выключены"}
              </div>
            </div>
            {isSubscribed ? (
              <button onClick={unsubscribe} style={{ background: "none", border: "1px solid #e8e6df", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#6b6860", cursor: "pointer", touchAction: "manipulation" }}>Отключить</button>
            ) : (
              <button onClick={handleSubscribe} style={{ background: "#1a1a18", border: "none", color: "#fff", padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", touchAction: "manipulation" }}>Включить</button>
            )}
          </div>
        </div>

        <button onClick={handleLogout} style={{ width: "100%", background: "rgba(217,64,64,0.08)", color: "#d94040", border: "1px solid rgba(217,64,64,0.2)", padding: 14, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Выйти из аккаунта
        </button>

      </div>
    </div>
  );
}