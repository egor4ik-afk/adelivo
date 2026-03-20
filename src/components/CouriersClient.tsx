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

// Форматируем дату как "Ср 20.03"
function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export function CouriersClient({ user }: { user: any }) {
  const router = useRouter();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Генерируем массив из 7 дней, начиная с сегодня
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  // По умолчанию сортируем так, чтобы те, кто работает ЗАВТРА (индекс 1), были наверху
  const defaultSortDate = dates[1]; 
  const [sortDate, setSortDate] = useState(defaultSortDate);

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

  const toggleShift = async (courierId: number, date: string, isWorking: boolean) => {
    // Оптимистичное обновление UI (галочка ставится мгновенно)
    setCouriers(prev => prev.map(c => {
      if (c.id === courierId) {
        const newShifts = isWorking 
          ? [...c.shifts, { id: "temp", date }]
          : c.shifts.filter(s => s.date !== date);
        return { ...c, shifts: newShifts };
      }
      return c;
    }));

    // Фоновая отправка на сервер
    await fetch("/api/couriers/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courierId, date, isWorking })
    });
  };

  const filtered = couriers.filter(c => {
    if (!c.isActive) return false;
    if (search && !c.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aWorks = a.shifts.some(s => s.date === sortDate);
    const bWorks = b.shifts.some(s => s.date === sortDate);
    if (aWorks && !bWorks) return -1;
    if (!aWorks && bWorks) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  return (
    <div style={s.app}>
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
            <p style={s.subtitle}>Управление сменами на неделю вперед. Галочки сохраняются автоматически.</p>
          </div>
          
          <div style={s.controls}>
            <input 
              type="text" 
              placeholder="Поиск курьера..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              style={s.input} 
            />
            <button style={s.syncBtn} onClick={async () => {
              setLoading(true);
              await fetch("/api/couriers/sync");
              await fetchCouriers();
            }}>
              🔄 Синхронизировать базу из CRM
            </button>
          </div>
        </div>

        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width: 220 }}>Курьер</th>
                <th style={{ ...s.th, width: 150 }}>Телефон</th>
                {dates.map((d, i) => (
                  <th 
                    key={d} 
                    style={{ ...s.th, textAlign: "center", cursor: "pointer", color: sortDate === d ? "#4a7aff" : "#a8a49c", background: sortDate === d ? "#eef3ff" : "#fafaf8" }}
                    onClick={() => setSortDate(d)}
                    title="Нажмите, чтобы отсортировать по этому дню"
                  >
                    {i === 0 ? "Сегодня" : i === 1 ? "Завтра" : formatDay(d)}
                    <br/><span style={{ fontSize: 10, fontWeight: 500 }}>{d.slice(5).replace("-", ".")}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Курьеры не найдены</td></tr>
              ) : sorted.map(c => {
                const isSortDayWorking = c.shifts.some(s => s.date === sortDate);
                return (
                  <tr key={c.id} style={{ background: isSortDayWorking ? "#fcfcfc" : "#fff", borderBottom: "1px solid #f0efe9" }}>
                    <td style={{ ...s.td, fontWeight: 600 }}>
                      <div style={{ lineHeight: "1.2" }}>{c.fullName}</div>
                      {c.description && <div style={{ fontSize: 10, color: "#a8a49c", fontWeight: 400, marginTop: 2, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.description}</div>}
                    </td>
                    <td style={{ ...s.td, color: "#6b6860", fontSize: 12 }}>{c.phone || "—"}</td>
                    
                    {/* Рендерим 7 чекбоксов для каждого дня */}
                    {dates.map(date => {
                      const isWorking = c.shifts.some(s => s.date === date);
                      return (
                        <td key={date} style={{ ...s.td, textAlign: "center", background: sortDate === date ? "rgba(74,122,255,0.03)" : "transparent" }}>
                          <input 
                            type="checkbox" 
                            checked={isWorking} 
                            onChange={(e) => toggleShift(c.id, date, e.target.checked)} 
                            style={s.checkbox}
                          />
                        </td>
                      );
                    })}
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
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "auto" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0 },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, marginRight: 16 },
  logoDot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4a7aff" },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18" },
  userBtn: { width: 32, height: 32, borderRadius: "50%", background: "#4a7aff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff" },
  
  content: { padding: "24px", maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 },
  title: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: "0 0 4px 0" },
  subtitle: { fontSize: 13, color: "#6b6860", margin: 0 },
  controls: { display: "flex", gap: 10 },
  input: { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", outline: "none", fontSize: 13 },
  syncBtn: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a18", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  
  tableWrap: { background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" },
  table: { width: "100%", minWidth: 800, borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "10px 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#a8a49c", background: "#fafaf8", borderBottom: "1px solid #e8e6df", fontWeight: 600 },
  td: { padding: "10px 8px", fontSize: 13, color: "#1a1a18", verticalAlign: "middle" },
  
  checkbox: { width: 18, height: 18, cursor: "pointer", accentColor: "#4a7aff" }
};