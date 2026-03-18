// Placeholder for ProfilePanel.tsx"use client";
import { useState, useEffect } from "react";
import { usePushNotifications } from "./usePushNotifications";

interface Profile {
  id: string; email: string; role: string;
  firstName?: string | null; lastName?: string | null;
  phone?: string | null; lastLoginAt?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: "Оператор",
  COURIER: "Курьер",
  ADMIN: "Администратор",
};

const PUSH_LABELS: Record<string, string> = {
  loading: "...",
  unsupported: "Не поддерживается",
  denied: "Заблокированы браузером",
  default: "Включить уведомления",
  granted: "Уведомления включены",
};

export function ProfilePanel({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const { state: pushState, subscribe, unsubscribe } = usePushNotifications();

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then(data => {
      setProfile(data);
      setForm({ firstName: data.firstName ?? "", lastName: data.lastName ?? "", phone: data.phone ?? "" });
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const updated = await res.json();
    setProfile(p => ({ ...p!, ...updated }));
    setEditing(false);
    setSaving(false);
  }

  const initials = profile
    ? ((profile.firstName?.[0] ?? "") + (profile.lastName?.[0] ?? "")).toUpperCase() || profile.email.slice(0, 2).toUpperCase()
    : "??";

  const fullName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "—" : "—";

  if (!profile) return <div style={s.panel}><div style={{ color: "var(--text3)", padding: 16, fontSize: 12 }}>Загрузка...</div></div>;

  return (
    <div style={s.panel} onClick={e => e.stopPropagation()}>
      <div style={s.header}>
        <div style={s.avatarLg}>{initials}</div>
        <div style={{ flex: 1 }}>
          <div style={s.name}>{fullName}</div>
          <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            <span style={s.roleBadge}>{ROLE_LABELS[profile.role] ?? profile.role}</span>
            {profile.role !== "COURIER" && <span style={s.futureBadge}>Курьер — скоро</span>}
          </div>
        </div>
        <button style={s.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div style={s.divider} />

      {!editing ? (
        <>
          <InfoRow label="Email"   value={profile.email} accent />
          <InfoRow label="Телефон" value={profile.phone ?? "—"} />
          <InfoRow label="Имя"     value={fullName} />
          <InfoRow label="Роль"    value={ROLE_LABELS[profile.role] ?? profile.role} />
          {profile.lastLoginAt && (
            <InfoRow label="Последний вход" value={new Date(profile.lastLoginAt).toLocaleString("ru")} muted />
          )}

          <div style={s.divider} />

          {/* Push уведомления */}
          <div style={s.pushRow}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>Push-уведомления</div>
              <div style={{ fontSize: 11, color: pushState === "granted" ? "var(--green)" : "var(--text3)", marginTop: 2 }}>
                {PUSH_LABELS[pushState]}
              </div>
            </div>
            {pushState === "granted" ? (
              <button style={s.pushBtnOff} onClick={unsubscribe}>Выкл.</button>
            ) : pushState === "default" ? (
              <button style={s.pushBtnOn} onClick={subscribe}>Включить</button>
            ) : null}
          </div>

          <button style={s.editBtn} onClick={() => setEditing(true)}>Редактировать профиль</button>
          <button style={s.logoutBtn} onClick={onLogout}>Выйти из аккаунта</button>
        </>
      ) : (
        <>
          <div style={s.sectionTitle}>Личные данные</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <Field label="Имя"     value={form.firstName} onChange={v => setForm(f => ({ ...f, firstName: v }))} />
            <Field label="Фамилия" value={form.lastName}  onChange={v => setForm(f => ({ ...f, lastName: v }))} />
          </div>
          <Field label="Телефон" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+7 (999) 000-00-00" />

          <div style={s.sectionTitle}>Роль</div>
          <div style={{ ...s.fieldStatic, marginBottom: 12 }}>{ROLE_LABELS[profile.role]} — назначается администратором</div>

          <div style={s.sectionTitle}>Email</div>
          <div style={{ ...s.fieldStatic, marginBottom: 14 }}>{profile.email}</div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={s.saveBtn} disabled={saving} onClick={handleSave}>{saving ? "Сохраняем..." : "Сохранить"}</button>
            <button style={s.cancelBtn} onClick={() => setEditing(false)}>Отмена</button>
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "0.5px solid var(--border)" }}>
      <span style={{ fontSize: 12, color: "var(--text2)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: muted ? "var(--text3)" : accent ? "#4a7aff" : "var(--text)" }}>{value}</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, color: "var(--text3)", textTransform: "uppercase" as const, letterSpacing: ".4px", marginBottom: 4 }}>{label}</div>
      <input style={s.fieldInput} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? ""} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: { background: "#fff", border: "1px solid #e8e6df", borderRadius: 12, padding: 16, width: 268, boxShadow: "0 4px 24px rgba(0,0,0,0.09)", fontFamily: "Manrope, system-ui, sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, position: "relative" },
  avatarLg: { width: 44, height: 44, borderRadius: "50%", background: "#4a7aff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, color: "#fff", flexShrink: 0 },
  name: { fontSize: 14, fontWeight: 500, color: "#1a1a18" },
  roleBadge: { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 500, background: "#E6F1FB", color: "#0C447C" },
  futureBadge: { display: "inline-block", padding: "2px 6px", borderRadius: 10, fontSize: 9, fontWeight: 500, background: "#FAEEDA", color: "#633806" },
  closeBtn: { position: "absolute", right: 0, top: 0, background: "none", border: "none", color: "#a8a49c", fontSize: 14, cursor: "pointer", padding: 2 },
  divider: { height: "0.5px", background: "#e8e6df", margin: "10px 0" },
  pushRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", marginBottom: 4 },
  pushBtnOn: { padding: "5px 12px", borderRadius: 6, background: "#4a7aff", border: "none", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  pushBtnOff: { padding: "5px 12px", borderRadius: 6, background: "transparent", border: "1px solid #e8e6df", color: "#a8a49c", fontSize: 11, cursor: "pointer" },
  editBtn: { width: "100%", marginTop: 10, padding: 8, borderRadius: 8, background: "#f5f4f0", border: "0.5px solid #e8e6df", color: "#1a1a18", fontSize: 12, cursor: "pointer" },
  logoutBtn: { width: "100%", marginTop: 6, padding: 8, borderRadius: 8, background: "rgba(217,64,64,0.07)", border: "1px solid rgba(217,64,64,0.15)", color: "#d94040", fontSize: 12, cursor: "pointer" },
  sectionTitle: { fontSize: 11, fontWeight: 500, color: "#a8a49c", marginBottom: 8, marginTop: 4 },
  fieldStatic: { fontSize: 12, color: "#a8a49c", padding: "7px 10px", borderRadius: 7, background: "#f5f4f0" },
  fieldInput: { width: "100%", padding: "7px 10px", borderRadius: 7, border: "1px solid #e8e6df", background: "#fafaf8", color: "#1a1a18", fontSize: 12, fontFamily: "Manrope, system-ui, sans-serif", outline: "none" },
  saveBtn: { flex: 1, padding: 8, borderRadius: 7, background: "#4a7aff", border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  cancelBtn: { padding: "8px 14px", borderRadius: 7, background: "transparent", border: "1px solid #e8e6df", color: "#6b6860", fontSize: 12, cursor: "pointer" },
};