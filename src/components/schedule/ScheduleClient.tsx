// src/components/schedule/ScheduleClient.tsx
// Недельный график: сотрудники офиса и курьеры двумя вкладками.
//
// Вкладка «Сотрудники» — новая: раньше смены были только у курьеров, и
// менеджеру негде было отметить, что он сегодня на смене.
// Вкладка «Курьеры» повторяет график со страницы /couriers, но только для
// чтения: редактирование остаётся там, где к нему привязаны ЗП и задания.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Shift = { date: string; startTime: string | null; endTime: string | null };

type Staff = {
  id: string;
  role: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  shifts: Shift[];
};

type Courier = {
  id: number;
  fullName: string;
  isActive: boolean;
  shifts: { date: string; startTime?: string | null; endTime?: string | null }[];
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Администратор",
  OPERATOR: "Оператор",
  COURIER: "Курьер",
};

const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Понедельник недели, в которую попадает дата. */
function mondayOf(d: Date): string {
  const x = new Date(d);
  // getDay(): 0 — воскресенье. Сдвигаем так, чтобы неделя начиналась с Пн
  const shift = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - shift);
  return x.toISOString().split("T")[0];
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

export function ScheduleClient() {
  const [tab, setTab] = useState<"staff" | "couriers">("staff");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));

  const [staff, setStaff] = useState<Staff[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [canEditOthers, setCanEditOthers] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const today = new Date().toLocaleDateString("en-CA");

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/shifts?weekStart=${weekStart}`);
      if (!res.ok) throw new Error("Не удалось загрузить график");
      const d = await res.json();
      setStaff(d.staff ?? []);
      setCanEditOthers(!!d.canEditOthers);
      setViewerId(d.viewerId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  const loadCouriers = useCallback(async () => {
    try {
      const res = await fetch("/api/couriers");
      if (res.ok) setCouriers(await res.json());
    } catch { /* вкладка просто останется пустой */ }
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);
  useEffect(() => { if (tab === "couriers" && couriers.length === 0) loadCouriers(); }, [tab, couriers.length, loadCouriers]);

  // Прокручиваем к сегодняшнему дню: на мобиле неделя не помещается,
  // и без этого экран открывается на понедельнике
  useEffect(() => {
    const el = document.getElementById(`day-${today}`);
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ left: Math.max(el.offsetLeft - 200, 0), behavior: "smooth" });
    }
  }, [tab, weekStart, today, loading]);

  const toggleStaffShift = async (userId: string, date: string, isWorking: boolean) => {
    // Оптимистично: клик по клетке должен отзываться сразу
    setStaff((prev) =>
      prev.map((u) =>
        u.id !== userId
          ? u
          : {
              ...u,
              shifts: isWorking
                ? [...u.shifts, { date, startTime: "10:00", endTime: "22:00" }]
                : u.shifts.filter((s) => s.date !== date),
            }
      )
    );
    try {
      const res = await fetch("/api/staff/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, date, isWorking }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Откатываем: иначе на экране остаётся смена, которой нет в базе
      loadStaff();
    }
  };

  const updateStaffTime = async (userId: string, date: string, field: "startTime" | "endTime", value: string) => {
    const shift = staff.find((u) => u.id === userId)?.shifts.find((s) => s.date === date);
    if (!shift) return;
    const next = { ...shift, [field]: value };

    setStaff((prev) =>
      prev.map((u) =>
        u.id !== userId ? u : { ...u, shifts: u.shifts.map((s) => (s.date === date ? next : s)) }
      )
    );
    await fetch("/api/staff/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, date, isWorking: true, startTime: next.startTime, endTime: next.endTime }),
    }).catch(() => loadStaff());
  };

  const nameOf = (u: Staff) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;

  return (
    <div>
      {/* Вкладки и переключение недели */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setTab("staff")} style={tab === "staff" ? tabActive : tabIdle}>
            👔 Сотрудники
          </button>
          <button onClick={() => setTab("couriers")} style={tab === "couriers" ? tabActive : tabIdle}>
            🛵 Курьеры
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={navBtn} aria-label="Предыдущая неделя">←</button>
          <button onClick={() => setWeekStart(mondayOf(new Date()))} style={navBtn}>Сегодня</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={navBtn} aria-label="Следующая неделя">→</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 10, background: "var(--color-surface)", color: "var(--color-red, #F87171)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {tab === "staff" && !canEditOthers && (
        <div style={hint}>
          Вы можете отмечать только свои смены. Чужие меняет администратор.
        </div>
      )}

      {tab === "couriers" && (
        <div style={hint}>
          Только просмотр. Смены курьеров редактируются на странице{" "}
          <Link href="/couriers" style={{ color: "var(--color-accent)", fontWeight: 700 }}>Курьеры</Link>,
          где к ним привязаны ЗП и задания.
        </div>
      )}

      {/* Горизонтальная прокрутка: семь дней и колонка с именем не влезают
          в 360px, а перенос строк превратил бы таблицу в кашу */}
      <div ref={scrollRef} style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...th, position: "sticky", left: 0, zIndex: 2, background: "var(--color-card)", minWidth: 190 }}>
                {tab === "staff" ? "Сотрудник" : "Курьер"}
              </th>
              {dates.map((d, i) => {
                const isToday = d === today;
                return (
                  <th
                    key={d}
                    id={`day-${d}`}
                    style={{
                      ...th,
                      minWidth: 92,
                      color: isToday ? "var(--color-accent)" : "var(--color-text-3)",
                    }}
                  >
                    <div>{DAY_SHORT[i]}</div>
                    <div style={{ fontSize: 11, fontWeight: 500 }}>
                      {d.slice(8, 10)}.{d.slice(5, 7)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {tab === "staff" && loading && (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--color-text-3)" }}>Загрузка…</td></tr>
            )}

            {tab === "staff" && !loading && staff.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--color-text-3)" }}>Сотрудников пока нет</td></tr>
            )}

            {tab === "staff" && staff.map((u) => {
              const editable = canEditOthers || u.id === viewerId;
              return (
                <tr key={u.id}>
                  <td style={{ ...td, position: "sticky", left: 0, zIndex: 1, background: "var(--color-card)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{nameOf(u)}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-3)" }}>{ROLE_LABEL[u.role] ?? u.role}</div>
                  </td>

                  {dates.map((d) => {
                    const shift = u.shifts.find((s) => s.date === d);
                    return (
                      <td key={d} style={{ ...td, textAlign: "center", padding: 6 }}>
                        <button
                          onClick={() => editable && toggleStaffShift(u.id, d, !shift)}
                          disabled={!editable}
                          title={editable ? (shift ? "Снять смену" : "Поставить смену") : "Только для администратора"}
                          style={{
                            width: "100%", minHeight: 34, borderRadius: 8,
                            border: `1px solid ${shift ? "var(--color-accent)" : "var(--color-border)"}`,
                            background: shift ? "var(--color-accent)" : "transparent",
                            color: shift ? "#fff" : "var(--color-text-3)",
                            fontSize: 11, fontWeight: 700,
                            cursor: editable ? "pointer" : "default",
                            opacity: editable ? 1 : 0.6,
                          }}
                        >
                          {shift ? `${shift.startTime ?? "10:00"}–${shift.endTime ?? "22:00"}` : "—"}
                        </button>

                        {shift && editable && (
                          <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                            <input
                              type="time" value={shift.startTime ?? "10:00"}
                              onChange={(e) => updateStaffTime(u.id, d, "startTime", e.target.value)}
                              style={timeInput}
                            />
                            <input
                              type="time" value={shift.endTime ?? "22:00"}
                              onChange={(e) => updateStaffTime(u.id, d, "endTime", e.target.value)}
                              style={timeInput}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {tab === "couriers" && couriers.filter((c) => c.isActive).map((c) => (
              <tr key={c.id}>
                <td style={{ ...td, position: "sticky", left: 0, zIndex: 1, background: "var(--color-card)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{c.fullName}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-3)" }}>Курьер</div>
                </td>
                {dates.map((d) => {
                  const shift = c.shifts?.find((s) => s.date === d);
                  return (
                    <td key={d} style={{ ...td, textAlign: "center", padding: 6 }}>
                      <div style={{
                        minHeight: 34, borderRadius: 8, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        border: `1px solid ${shift ? "var(--color-accent)" : "var(--color-border)"}`,
                        background: shift ? "rgba(93,135,255,0.18)" : "transparent",
                        color: shift ? "var(--color-text)" : "var(--color-text-3)",
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {shift ? `${shift.startTime ?? "10:00"}–${shift.endTime ?? "22:00"}` : "—"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {tab === "couriers" && couriers.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--color-text-3)" }}>Загрузка…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 8px", fontSize: 12, fontWeight: 800,
  color: "var(--color-text-3)", textAlign: "center",
  borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "8px 10px", borderBottom: "1px solid var(--color-border)", verticalAlign: "top",
};

const tabActive: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 10, border: "1px solid var(--color-accent)",
  background: "var(--color-accent)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const tabIdle: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 10, border: "1px solid var(--color-border)",
  background: "transparent", color: "var(--color-text-2)", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const navBtn: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 9, border: "1px solid var(--color-border)",
  background: "transparent", color: "var(--color-text-2)", fontSize: 12, fontWeight: 700, cursor: "pointer",
};

const hint: React.CSSProperties = {
  fontSize: 12, color: "var(--color-text-3)", marginBottom: 10,
};

const timeInput: React.CSSProperties = {
  width: "50%", fontSize: 10, padding: "2px 3px", borderRadius: 6,
  border: "1px solid var(--color-border)", background: "var(--color-surface)",
  color: "var(--color-text)",
};