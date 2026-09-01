// src/components/company/CompanyRegisterForm.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SITE = "adelivo.ru";

export function CompanyRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "code">("form");
  const [v, setV] = useState({ name: "", slug: "", email: "", phone: "" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugState, setSlugState] = useState<{ slug: string; free: boolean; error?: string } | null>(null);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  // Проверяем адрес, пока человек печатает — чтобы он не узнал о занятости
  // только после отправки кода на почту
  useEffect(() => {
    const raw = v.slug || v.name;
    if (!raw.trim()) { setSlugState(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/company/register?slug=${encodeURIComponent(raw)}`);
        setSlugState(await res.json());
      } catch { /* сеть моргнула — просто не показываем подсказку */ }
    }, 400);
    return () => clearTimeout(t);
  }, [v.slug, v.name]);

  const send = async (payload: object, next?: () => void) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/company/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось выполнить");
      next?.();
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const start = () => send({ step: "start", ...v }, () => setStep("code"));
  const confirm = async () => {
    const d = await send({ step: "confirm", code });
    if (d?.ok) router.push("/company");
  };

  return (
    <div className="form-wrap" style={{ maxWidth: 520 }}>
      {error && (
        <div style={{
          background: "rgba(var(--ew-red-rgb),0.12)",
          border: "1px solid rgba(var(--ew-red-rgb),0.35)",
          color: "var(--ew-red)", borderRadius: 10, padding: "0.8rem 1rem",
          fontSize: "0.85rem", marginBottom: "1.2rem", lineHeight: 1.6,
        }}>{error}</div>
      )}

      {step === "form" ? (
        <>
          <Field label="Название компании">
            <input className="ew-input" value={v.name} onChange={set("name")} placeholder="Цветочная лавка" />
          </Field>

          <Field label="Адрес для сотрудников">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--ew-muted)", fontSize: "0.85rem", whiteSpace: "nowrap" }}>{SITE}/</span>
              <input className="ew-input" value={v.slug} onChange={set("slug")} placeholder="magaz" />
            </div>
            {slugState && (
              <p style={{
                fontSize: "0.75rem", marginTop: "0.4rem",
                color: slugState.free ? "var(--ew-green)" : "var(--ew-red)",
              }}>
                {slugState.free
                  ? `Адрес ${SITE}/${slugState.slug} свободен`
                  : slugState.error ?? "Адрес занят"}
              </p>
            )}
          </Field>

          <Field label="Рабочая почта">
            <input className="ew-input" type="email" value={v.email} onChange={set("email")} placeholder="you@company.ru" />
          </Field>

          <Field label="Телефон">
            <input className="ew-input" value={v.phone} onChange={set("phone")} placeholder="+7 999 000-00-00" />
          </Field>

          <button
            onClick={start}
            disabled={busy || v.name.trim().length < 2 || !v.email.includes("@") || slugState?.free === false}
            className="btn-pri"
            style={{ width: "100%", justifyContent: "center", marginTop: "0.6rem", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Отправляем код…" : "Продолжить →"}
          </button>

          <p style={{ fontSize: "0.75rem", color: "var(--ew-muted)", marginTop: "1rem", lineHeight: 1.7 }}>
            Пароль придумывать не нужно: вход по коду с почты. После подтверждения
            вы станете администратором компании и сможете подключить свой магазин.
          </p>
        </>
      ) : (
        <>
          <p style={{ color: "var(--ew-sub)", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "1.2rem" }}>
            Код отправлен на <strong style={{ color: "var(--ew-text)" }}>{v.email}</strong>.
            Введите шесть цифр из письма.
          </p>

          <Field label="Код из письма">
            <input
              className="ew-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              style={{ letterSpacing: "0.4em", fontSize: "1.1rem", textAlign: "center" }}
              autoFocus
            />
          </Field>

          <button
            onClick={confirm}
            disabled={busy || code.length < 4}
            className="btn-pri"
            style={{ width: "100%", justifyContent: "center", marginTop: "0.6rem", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Создаём компанию…" : "Создать компанию →"}
          </button>

          <button
            onClick={() => { setStep("form"); setError(null); }}
            className="btn-ghost"
            style={{ width: "100%", justifyContent: "center", marginTop: "0.6rem" }}
          >
            Изменить данные
          </button>
        </>
      )}

      <style>{`
        .ew-input{
          width:100%;padding:0.8rem 1rem;border-radius:10px;
          border:1px solid var(--ew-border);background:var(--ew-tint);
          color:var(--ew-text);font-size:0.9rem;font-family:inherit;outline:none;
          transition:border-color .2s;
        }
        .ew-input:focus{border-color:var(--ew-accent)}
        .ew-input::placeholder{color:var(--ew-muted)}
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{
        display: "block", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "var(--ew-muted)", marginBottom: "0.5rem",
      }}>{label}</label>
      {children}
    </div>
  );
}
