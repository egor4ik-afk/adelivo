// src/components/CouriersClient.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CourierShift {
  id: string;
  date: string;
}

interface Courier {
  id: number;
  fullName: string;
  phone: string | null;
  description: string | null;
  isActive: boolean;
  shifts: CourierShift[];
}

export function CouriersClient({ user }: { user: any }) {
  const router = useRouter();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  
  // По умолчанию выбрана сегодняшняя дата
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");

  const fetchCouriers = async () => {
    try {
      const res = await fetch("/api/couriers");
      if (res.ok) setCouriers(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCouriers();
  }, []);

  const toggleShift = async (courierId: number, isWorking: boolean) => {
    // Оптимистичное обновление UI (чтобы галочка ставилась мгновенно)
    setCouriers(prev => prev.map(c => {
      if (c.id === courierId) {
        const newShifts = isWorking 
          ? [...c.shifts, { id: "temp", date: selectedDate }]
          : c.shifts.filter(s => s.date !== selectedDate);
        return { ...c, shifts: newShifts };
      }
      return c;
    }));

    // Отправка на сервер
    await fetch("/api/couriers/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courierId, date: selectedDate, isWorking })
    });
  };

  // Фильтруем по поиску и активности
  const filtered = couriers.filter(c => {
    if (!c.isActive) return false; // Скрываем уволенных
    if (search && !c.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Сортировка: сначала те, кто сегодня работает, затем остальные по алфавиту
  const sorted = [...filtered].sort((a, b) => {
    const aWorks = a.shifts.some(s => s.date === selectedDate);
    const bWorks = b.shifts.some(s => s.date === selectedDate);
    if (aWorks && !bWorks) return -1;
    if (!aWorks && bWorks) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const workingCount = sorted.filter(c => c.shifts.some(s => s.date === selectedDate)).length;

  return (
    <div style={s.app}>
      {/* Верхняя панель (такая же как в дашборде) */}
      <div style={s.topbar}>
        <div style={s.logo}><span style={s.logoDot} />FlowerOps</div>
        <button onClick={() => router.push('/dashboard')} style={s.navBtn}>🗺️ Дашборд</button>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>≡ Заказы</button>
        <div style={{ flex: 1 }} />
        <button style={s.userBtn}>{user.email?.slice(0, 2).toUpperCase() || "AD"}</button>
      </div>

      <div style={s.content}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.title}>График курьеров</h1>
            <p style={s.subtitle}>Назначено на смену: <b>{workingCount}</b> чел.</p>
          </div>
          
          <div style={s.controls}>
            <input 
              type="text" 
              placeholder="Поиск по имени..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              style={s.input} 
            />
            <input 
              type="date" 
              value={selectedDate} 
              onChange={e => setSelectedDate(e.target.value)} 
              style={s.input} 
            />
            <button style={s.syncBtn} onClick={async () => {
              setLoading(true);
              await fetch("/api/couriers/sync");
              await fetchCouriers();
            }}>
              🔄 Синхронизировать с CRM
            </button>
          </div>
        </div>

        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Смена ({selectedDate})</th>
                <th style={s.th}>Курьер</th>
                <th style={s.th}>Телефон</th>
                <th style={s.th}>Примечание CRM</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Курьеры не найдены</td></tr>
              ) : sorted.map(c => {
                const isWorking = c.shifts.some(s => s.date === selectedDate);
                return (
                  <tr key={c.id} style={{ background: isWorking ? "#f4f7ff" : "#fff", borderBottom: "1px solid #f0efe9" }}>
                    <td style={s.td}>
                      <label style={s.checkboxLabel}>
                        <input 
                          type="checkbox" 
                          checked={isWorking} 
                          onChange={(e) => toggleShift(c.id, e.target.checked)} 
                          style={s.checkbox}
                        />
                        {isWorking ? <span style={{ color: "#4a7aff", fontWeight: 600 }}>Работает</span> : <span style={{ color: "#a8a49c" }}>Отдыхает</span>}
                      </label>
                    </td>
                    <td style={{ ...s.td, fontWeight: 600 }}>{c.fullName}</td>
                    <td style={{ ...s.td, color: "#6b6860" }}>{c.phone || "—"}</td>
                    <td style={{ ...s.td, color: "#a8a49c", fontSize: 11, maxWidth: 300 }}>{c.description || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0 },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, marginRight: 16 },
  logoDot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4a7aff" },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18" },
  userBtn: { width: 32, height: 32, borderRadius: "50%", background: "#4a7aff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff" },
  
  content: { padding: "24px", maxWidth: 1000, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 },
  title: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: "0 0 4px 0" },
  subtitle: { fontSize: 13, color: "#6b6860", margin: 0 },
  controls: { display: "flex", gap: 10 },
  input: { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", outline: "none", fontSize: 13 },
  syncBtn: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a18", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  
  tableWrap: { background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" },
  table: { width: "100%", borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "12px 16px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#a8a49c", background: "#fafaf8", borderBottom: "1px solid #e8e6df", fontWeight: 600 },
  td: { padding: "12px 16px", fontSize: 13, color: "#1a1a18", verticalAlign: "middle" },
  
  checkboxLabel: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12 },
  checkbox: { width: 16, height: 16, cursor: "pointer", accentColor: "#4a7aff" }
};