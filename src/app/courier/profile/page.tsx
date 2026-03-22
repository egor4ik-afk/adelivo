// src/app/courier/profile/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CourierProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  
  // Генерация ближайших 14 дней для графика
  const generateDays = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }); // YYYY-MM-DD
      const dayName = d.toLocaleDateString("ru-RU", { weekday: "short" });
      const dayNum = d.getDate();
      days.push({ date: dateStr, dayName, dayNum });
    }
    return days;
  };

  const days = generateDays();
  const [myShifts, setMyShifts] = useState<string[]>([]); // Массив дат, когда курьер работает

  useEffect(() => {
    // В реальном коде запрашиваем профиль и смены из БД
    setProfile({ firstName: "Антон", lastName: "Краснов", email: "courier@test.ru", phone: "+7 999 123-45-67" });
    setMyShifts([days[0].date, days[2].date]); // Мок данных: работает сегодня и послезавтра
  }, []);

  const toggleShift = async (date: string) => {
    // Оптимистичное обновление UI
    setMyShifts(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
    
    // В будущем тут будет API вызов к твоей таблице CourierShift
    // await fetch("/api/couriers/shifts", { method: "POST", body: JSON.stringify({ date }) });
  };

  if (!profile) return <div style={{ padding: 20, textAlign: "center" }}>Загрузка...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f4f0", overflowY: "auto" }}>
      
      <div style={{ padding: "24px 16px", background: "#fff", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #e8e6df" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#4a7aff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>
          {profile.firstName?.[0]}{profile.lastName?.[0]}
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: "#1a1a18" }}>{profile.firstName} {profile.lastName}</h1>
          <p style={{ margin: 0, fontSize: 13, color: "#a8a49c" }}>Роль: Курьер</p>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        
        {/* Блок Графика работы */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>График смен (ближайшие 14 дней)</h2>
          <p style={{ fontSize: 12, color: "#6b6860", marginBottom: 16 }}>Отмечайте дни, когда вы готовы выходить на маршрут.</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {days.map((d, i) => {
              const isWorking = myShifts.includes(d.date);
              const isToday = i === 0;
              return (
                <div 
                  key={d.date} 
                  onClick={() => toggleShift(d.date)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0",
                    borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                    background: isWorking ? "#10b981" : "#f5f4f0",
                    color: isWorking ? "#fff" : "#1a1a18",
                    border: isToday && !isWorking ? "1px solid #1a1a18" : "1px solid transparent"
                  }}
                >
                  <span style={{ fontSize: 10, textTransform: "uppercase", opacity: isWorking ? 0.9 : 0.5 }}>{d.dayName}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{d.dayNum}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Личные данные */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", margin: "0 0 12px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>Контакты</h2>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0efe9" }}>
            <span style={{ fontSize: 13, color: "#a8a49c" }}>Телефон</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a18" }}>{profile.phone || "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
            <span style={{ fontSize: 13, color: "#a8a49c" }}>Email</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a18" }}>{profile.email}</span>
          </div>
        </div>

        {/* Кнопки управления */}
        <button style={{ width: "100%", background: "#1a1a18", color: "#fff", border: "none", padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
          Включить Push-уведомления
        </button>
        
        <button onClick={() => router.push("/login")} style={{ width: "100%", background: "rgba(217,64,64,0.1)", color: "#d94040", border: "1px solid rgba(217,64,64,0.2)", padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
          Выйти из аккаунта
        </button>

      </div>
    </div>
  );
}