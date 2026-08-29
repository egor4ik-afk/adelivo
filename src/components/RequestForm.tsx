"use client";
// src/components/RequestForm.tsx
import { useState } from "react";
import { C } from "@/components/theme/theme";


function formatPhone(raw: string): string {
  // Оставляем только цифры
  const digits = raw.replace(/\D/g, "");
  // Нормализуем начало: 8 → 7
  const d = digits.startsWith("8") ? "7" + digits.slice(1) : digits;
  if (!d) return "";
  let result = "+";
  if (d.length > 0) result += d.slice(0, 1);
  if (d.length > 1) result += " (" + d.slice(1, 4);
  if (d.length > 4) result += ") " + d.slice(4, 7);
  if (d.length > 7) result += "-" + d.slice(7, 9);
  if (d.length > 9) result += "-" + d.slice(9, 11);
  return result;
}

export function RequestForm() {
  const [form, setForm] = useState({
    name: "", company: "", phone: "", email: "",
    orders: "", time: "", price: "", couriers: "", collab: "",
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handlePhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setForm(prev => ({ ...prev, phone: formatted }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const d = await res.json();
        setError(d.error || "Ошибка отправки");
      }
    } catch {
      setError("Сетевая ошибка. Напишите нам в Telegram.");
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    background: "var(--ew-tint)",
    border: `1px solid ${C.border}`,
    borderRadius: 10, padding: "0.7rem 1rem",
    color: C.text, fontSize: "0.88rem",
    fontFamily: "inherit", outline: "none",
    width: "100%", transition: "border-color 0.2s",
    boxSizing: "border-box",
  };

  const selStyle: React.CSSProperties = {
    ...inp,
    cursor: "pointer",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2364748B' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    paddingRight: "2.2rem",
    appearance: "none" as any,
    WebkitAppearance: "none" as any,
    MozAppearance: "none" as any,
  };

  const lbl: React.CSSProperties = {
    fontSize: "0.75rem", fontWeight: 600, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.08em",
    marginBottom: "0.4rem", display: "block",
  };

  const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
    (e.target.style.borderColor = C.accent);
  const blurBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) =>
    (e.target.style.borderColor = C.border);

  if (sent) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
        <div style={{ fontSize: "1.2rem", fontWeight: 700, color: C.text, marginBottom: "0.5rem" }}>
          Заявка отправлена!
        </div>
        <div style={{ fontSize: "0.88rem", color: C.muted, lineHeight: 1.7, marginBottom: "1.5rem" }}>
          Наш менеджер свяжется с вами в Telegram или по телефону<br />
          в течение 1 часа в рабочее время.
        </div>
        <div style={{ display: "flex", gap: "0.8rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="https://t.me/adelivo"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.8rem 1.5rem",
              background: C.accent, color: C.bg,
              borderRadius: 10, fontWeight: 700, fontSize: "0.88rem",
              textDecoration: "none",
            }}
          >
            Написать в Telegram →
          </a>
          <button
            onClick={() => {
              setSent(false);
              setForm({ name: "", company: "", phone: "", email: "", orders: "", time: "", price: "", couriers: "", collab: "" });
            }}
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.8rem 1.5rem",
              background: "var(--ew-tint)",
              border: `1px solid ${C.border}`,
              color: C.muted, borderRadius: 10, fontWeight: 600,
              fontSize: "0.88rem", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Отправить ещё одну
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Имя */}
        <div>
          <label style={lbl} htmlFor="req-name">Имя *</label>
          <input id="req-name" style={inp} placeholder="Иван Иванов"
            value={form.name} onChange={set("name")} required
            onFocus={focusBorder} onBlur={blurBorder} />
        </div>
        {/* Компания */}
        <div>
          <label style={lbl} htmlFor="req-company">Компания</label>
          <input id="req-company" style={inp} placeholder="ООО Цветы"
            value={form.company} onChange={set("company")}
            onFocus={focusBorder} onBlur={blurBorder} />
        </div>
        {/* Телефон — с маской */}
        <div>
          <label style={lbl} htmlFor="req-phone">Телефон *</label>
          <input
            id="req-phone" type="tel" style={inp}
            placeholder="+7 (999) 000-00-00"
            value={form.phone}
            onChange={handlePhone}
            maxLength={18}
            required
            onFocus={focusBorder} onBlur={blurBorder}
          />
        </div>
        {/* Email */}
        <div>
          <label style={lbl} htmlFor="req-email">Email</label>
          <input id="req-email" type="email" style={inp} placeholder="ivan@company.ru"
            value={form.email} onChange={set("email")}
            onFocus={focusBorder} onBlur={blurBorder} />
        </div>
        {/* Заказов в день */}
        <div>
          <label style={lbl} htmlFor="req-orders">Заказов в день</label>
          <select id="req-orders" style={selStyle} value={form.orders} onChange={set("orders")}
            onFocus={focusBorder} onBlur={blurBorder}>
            <option value="" style={{ background: "var(--ew-surface)", color: C.text }}>Выберите...</option>
            <option style={{ background: "var(--ew-surface)", color: C.text }}>До 50</option>
            <option style={{ background: "var(--ew-surface)", color: C.text }}>50–200</option>
            <option style={{ background: "var(--ew-surface)", color: C.text }}>200–500</option>
            <option style={{ background: "var(--ew-surface)", color: C.text }}>Более 500</option>
          </select>
        </div>
        {/* Время */}
        <div>
          <label style={lbl} htmlFor="req-time">Время доставок</label>
          <input id="req-time" style={inp} placeholder="с 09:00 до 22:00"
            value={form.time} onChange={set("time")}
            onFocus={focusBorder} onBlur={blurBorder} />
        </div>
        {/* Цена */}
        <div>
          <label style={lbl} htmlFor="req-price">Стоимость доставки</label>
          <input id="req-price" style={inp} placeholder="500–1500 ₽"
            value={form.price} onChange={set("price")}
            onFocus={focusBorder} onBlur={blurBorder} />
        </div>
        {/* Курьеров */}
        <div>
          <label style={lbl} htmlFor="req-couriers">Своих курьеров</label>
          <input id="req-couriers" type="number" min="0" style={inp} placeholder="0"
            value={form.couriers} onChange={set("couriers")}
            onFocus={focusBorder} onBlur={blurBorder} />
        </div>
      </div>

      {/* Тип сотрудничества */}
      <div style={{ marginTop: "1.2rem" }}>
        <label style={lbl}>Тип сотрудничества *</label>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {[
            { v: "full",          l: "Полный аутсорс (~200 ₽/заказ)",             d: "Операторы, логисты и курьеры — всё на нас" },
            { v: "platform",      l: "Только платформа (20 ₽/заказ)",             d: "Свои операторы, логисты и курьеры — нужна только платформа" },
            { v: "no-couriers",   l: "Есть логисты, нет курьеров (50 ₽/заказ)",  d: "Предоставим курьеров и закроем бухгалтерию" },
            { v: "no-logistics",  l: "Есть курьеры, нет логистов (100 ₽/заказ)", d: "Предоставим логистов и операторов" },
            { v: "mixed",         l: "Смешанный / Не определился (договорная)",  d: "Обсудим детали и подберём формат" },
          ].map((opt) => {
            const isSelected = form.collab === opt.v;
            return (
              <label
                key={opt.v}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "0.7rem",
                  padding: "0.8rem 1rem",
                  background: isSelected ? "rgba(var(--ew-accent-rgb),0.06)" : "var(--ew-tint-2)",
                  border: `1px solid ${isSelected ? C.accent : C.border}`,
                  borderRadius: 10, cursor: "pointer", transition: "all 0.2s",
                }}
              >
                <input
                  type="radio" name="collab" value={opt.v}
                  checked={isSelected}
                  onChange={() => setForm(prev => ({ ...prev, collab: opt.v }))}
                  style={{ accentColor: C.accent, marginTop: "0.15rem", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: "0.83rem", color: C.text, fontWeight: 600, marginBottom: "0.15rem" }}>{opt.l}</div>
                  <div style={{ fontSize: "0.75rem", color: C.muted }}>{opt.d}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: "1rem", padding: "0.8rem 1rem", background: "rgba(var(--ew-red-rgb),0.08)", border: `1px solid rgba(var(--ew-red-rgb),0.2)`, borderRadius: 10, fontSize: "0.83rem", color: C.red }}>
          ❌ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !form.name || !form.phone}
        style={{
          width: "100%", padding: "0.9rem", borderRadius: 12, border: "none",
          background: loading ? "var(--ew-muted)" : `linear-gradient(135deg, ${C.accent}, var(--ew-accent-2))`,
          color: C.bg, fontWeight: 800, fontSize: "0.95rem",
          cursor: loading || !form.name || !form.phone ? "not-allowed" : "pointer",
          fontFamily: "inherit", marginTop: "1.5rem",
          opacity: !form.name || !form.phone ? 0.5 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
          transition: "opacity 0.2s",
        }}
      >
        {loading ? (
          <>
            <span style={{ width: 16, height: 16, border: "2px solid rgba(var(--ew-muted-rgb),0.35)", borderTopColor: "var(--ew-accent-contrast)", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
            Отправка...
          </>
        ) : "🤖 Отправить заявку →"}
      </button>
      <p style={{ fontSize: "0.72rem", color: C.muted, textAlign: "center", marginTop: "0.8rem", lineHeight: 1.6 }}>
        Ответим в течение 1 часа в рабочее время. Или напишите напрямую:{" "}
        <a href="https://t.me/adelivo" target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>@adelivo</a>
      </p>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` }} />
    </form>
  );
}