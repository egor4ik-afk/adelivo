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

  // Хук для Push-уведомлений
  const { state: pushState, subscribe, unsubscribe } = usePushNotifications();
  const isSubscribed = pushState === "granted";

  // Генерация ближайших 14 дней для графика
  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return { date: d.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }), dayName: d.toLocaleDateString("ru-RU", { weekday: "short" }), dayNum: d.getDate() };
  });

  const [myShifts, setMyShifts] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then(data => {
      setProfile(data);
      setNewPhone(data.phone || "");
    });
    // В будущем тут fetch("/api/couriers/shifts") 
  }, []);

  const toggleShift = async (date: string) => {
    setMyShifts(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
    // Тут будет POST на /api/couriers/shifts
  };

  const handleSavePhone = async () => {
    setSaving(true);
    await fetch("/api/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: newPhone })
    });
    setProfile(p => p ? { ...p, phone: newPhone } : null);
    setEditingPhone(false);
    setSaving(false);
  };

  const handleLogout = () => {
    document.cookie = "flowerops_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  };

  if (!profile) return <div style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка профиля...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f4f0", overflowY: "auto", paddingBottom: 40 }}>
      
      <div style={{ padding: "24px 16px", background: "#fff", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #e8e6df" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#4a7aff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>
          {(profile.firstName?.[0] || "") + (profile.lastName?.[0] || "")}
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: "#1a1a18" }}>{profile.firstName} {profile.lastName}</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#a8a49c" }}>Курьер • {profile.email}</p>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        
        {/* Блок Графика работы */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase" }}>Мои смены</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {days.map((d, i) => {
              const isWorking = myShifts.includes(d.date);
              return (
                <div key={d.date} onClick={() => toggleShift(d.date)} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0", borderRadius: 8, cursor: "pointer", background: isWorking ? "#10b981" : "#f5f4f0", color: isWorking ? "#fff" : "#1a1a18", border: i === 0 && !isWorking ? "1px solid #1a1a18" : "1px solid transparent" }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", opacity: isWorking ? 0.9 : 0.5 }}>{d.dayName}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{d.dayNum}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Настройки и контакты */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase" }}>Настройки</h2>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0efe9" }}>
            <div>
              <div style={{ fontSize: 13, color: "#a8a49c" }}>Номер телефона</div>
              {!editingPhone && <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a18", marginTop: 4 }}>{profile.phone}</div>}
              {editingPhone && <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #4a7aff", outline: "none", fontSize: 14, marginTop: 4 }} />}
            </div>
            {!editingPhone ? (
              <button onClick={() => setEditingPhone(true)} style={{ background: "none", border: "none", color: "#4a7aff", fontSize: 13, fontWeight: 600 }}>Изменить</button>
            ) : (
              <button onClick={handleSavePhone} disabled={saving} style={{ background: "#4a7aff", border: "none", color: "#fff", padding: "6px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>{saving ? "..." : "Сохранить"}</button>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
            <div>
              <div style={{ fontSize: 13, color: "#a8a49c" }}>Push-уведомления</div>
              <div style={{ fontSize: 12, color: isSubscribed ? "#10b981" : "#d94040", marginTop: 4, fontWeight: 600 }}>
                {isSubscribed ? "Включены" : "Выключены"}
              </div>
            </div>
            {isSubscribed ? (
              <button onClick={unsubscribe} style={{ background: "none", border: "1px solid #e8e6df", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#6b6860" }}>Отключить</button>
            ) : (
              <button onClick={subscribe} style={{ background: "#1a1a18", border: "none", color: "#fff", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Включить</button>
            )}
          </div>
        </div>

        <button onClick={handleLogout} style={{ width: "100%", background: "rgba(217,64,64,0.1)", color: "#d94040", border: "1px solid rgba(217,64,64,0.2)", padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
          Выйти из аккаунта
        </button>

      </div>
    </div>
  );
}