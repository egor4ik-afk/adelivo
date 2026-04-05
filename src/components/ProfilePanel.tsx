// src/components/ProfilePanel.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { usePushNotifications } from "./usePushNotifications";
import imageCompression from "browser-image-compression"; // 🔥 Для сжатия фото перед загрузкой

interface Profile {
  id: string; email: string; role: string;
  firstName?: string | null; lastName?: string | null;
  phone?: string | null; lastLoginAt?: string | null;
  avatarUrl?: string | null; // 🔥 Добавили аватарку
  notifyNewOrder?: boolean;
  notifyStatus?: boolean;
  notifyCourier?: boolean;
  notifyAddress?: boolean;
  notifyTime?: boolean;
  notifyComment?: boolean;
  notifyOpComment?: boolean;
  notifyItems?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: "Оператор",
  COURIER: "Курьер",
  ADMIN: "Администратор",
};

const SETTINGS = [
  { key: "notifyNewOrder", label: "Новые заказы" },
  { key: "notifyStatus", label: "Изменение статуса" },
  { key: "notifyCourier", label: "Назначение/снятие курьера" },
  { key: "notifyAddress", label: "Изменение адреса доставки" },
  { key: "notifyTime", label: "Изменение времени (слота)" },
  { key: "notifyComment", label: "Комментарий клиента" },
  { key: "notifyOpComment", label: "Комментарий оператора" },
  { key: "notifyItems", label: "Изменение состава" },
];

export function ProfilePanel({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" });
  const [saving, setSaving] = useState(false);
  
  // Для загрузки аватарки
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { state: pushState, subscribe, unsubscribe } = usePushNotifications();
  const isSubscribed = pushState === "granted";

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

  const togglePref = async (key: keyof Profile) => {
    if (!profile) return;
    const newVal = !(profile[key] ?? true);
    setProfile({ ...profile, [key]: newVal });
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: newVal })
    });
  };

  // 🔥 Функция загрузки аватарки
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploadingAvatar(true);
    try {
      // 1. Сжимаем картинку (аватарке не нужно высокое разрешение)
      const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 500, useWebWorker: true });

      // 2. Получаем ссылку для загрузки в S3
      const presignRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `avatar-${profile.id}-${Date.now()}.jpg`, contentType: compressed.type }),
      });

      if (!presignRes.ok) throw new Error("Upload failed");
      const { uploadUrl, fileUrl } = await presignRes.json();

      // 3. Загружаем файл
      await fetch(uploadUrl, { method: "PUT", body: compressed, headers: { "Content-Type": compressed.type } });

      // 4. Сохраняем ссылку в БД профиля
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: fileUrl })
      });

      // 5. Обновляем интерфейс
      setProfile(p => ({ ...p!, avatarUrl: fileUrl }));
    } catch (err) {
      alert("Ошибка при загрузке фото. Попробуйте еще раз.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = profile
    ? ((profile.firstName?.[0] ?? "") + (profile.lastName?.[0] ?? "")).toUpperCase() || profile.email.slice(0, 2).toUpperCase()
    : "??";

  const fullName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "—" : "—";

  if (!profile) return <div style={s.panel}><div style={{ color: "#a8a49c", padding: 16, fontSize: 12 }}>Загрузка...</div></div>;

  return (
    <div style={s.panel} onClick={e => e.stopPropagation()}>
      <div style={s.header}>
        
        {/* БЛОК АВАТАРКИ */}
        <div 
          style={{ position: "relative", cursor: editing ? "pointer" : "default" }} 
          onClick={() => editing && fileInputRef.current?.click()}
          title={editing ? "Изменить фото" : ""}
        >
          {uploadingAvatar ? (
            <div style={{ ...s.avatarLg, background: "#e8e6df" }}>⏳</div>
          ) : profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="Avatar" style={{ ...s.avatarLg, objectFit: "cover" }} />
          ) : (
            <div style={s.avatarLg}>{initials}</div>
          )}

          {/* Иконка фотика показывается только в режиме редактирования */}
          {editing && !uploadingAvatar && (
            <div style={{ position: "absolute", bottom: -2, right: -4, background: "#fff", borderRadius: "50%", padding: 4, boxShadow: "0 2px 5px rgba(0,0,0,0.2)", fontSize: 10, lineHeight: 1, display: "flex", alignItems: "center", justifyItems: "center" }}>
              📷
            </div>
          )}
        </div>

        {/* Скрытый инпут для файлов */}
        <input type="file" ref={fileInputRef} style={{ display: "none" }} accept="image/*" onChange={handleAvatarUpload} />

        <div style={{ flex: 1 }}>
          <div style={s.name}>{fullName}</div>
          <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            <span style={s.roleBadge}>{ROLE_LABELS[profile.role] ?? profile.role}</span>
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
              <div style={{ fontSize: 12, fontWeight: 500, color: "#1a1a18" }}>Push-уведомления</div>
              <div style={{ fontSize: 11, color: isSubscribed ? "#10b981" : "#a8a49c", marginTop: 2 }}>
                {isSubscribed ? "Уведомления включены" : "Выключены"}
              </div>
            </div>
            {isSubscribed ? (
              <button style={s.pushBtnOff} onClick={unsubscribe}>Выкл.</button>
            ) : (
              <button style={s.pushBtnOn} onClick={subscribe}>Включить</button>
            )}
          </div>

          {isSubscribed && (
            <div style={{ background: "#fafaf8", padding: 12, borderRadius: 8, display: "flex", flexDirection: "column", gap: 10, marginTop: 8, marginBottom: 8 }}>
              {SETTINGS.map(set => (
                <label key={set.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <span style={{ fontSize: 12, color: "#6b6860" }}>{set.label}</span>
                  <input 
                    type="checkbox" 
                    checked={(profile[set.key as keyof Profile] as boolean) ?? true} 
                    onChange={() => togglePref(set.key as keyof Profile)} 
                    style={{ accentColor: "#4a7aff", width: 16, height: 16, cursor: "pointer", margin: 0 }}
                  />
                </label>
              ))}
            </div>
          )}

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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "0.5px solid #e8e6df" }}>
      <span style={{ fontSize: 12, color: "#a8a49c" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: muted ? "#a8a49c" : accent ? "#4a7aff" : "#1a1a18" }}>{value}</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, color: "#a8a49c", textTransform: "uppercase" as const, letterSpacing: ".4px", marginBottom: 4 }}>{label}</div>
      <input style={s.fieldInput} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? ""} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: { 
    background: "#fff", border: "1px solid #e8e6df", borderRadius: 12, padding: 16, width: 300, 
    boxShadow: "0 4px 24px rgba(0,0,0,0.09)", fontFamily: "Manrope, system-ui, sans-serif",
    maxHeight: "85vh", overflowY: "auto",
  },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, position: "relative" },
  avatarLg: { width: 44, height: 44, borderRadius: "50%", background: "#4a7aff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, color: "#fff", flexShrink: 0 },
  name: { fontSize: 14, fontWeight: 500, color: "#1a1a18" },
  roleBadge: { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 500, background: "#E6F1FB", color: "#0C447C" },
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