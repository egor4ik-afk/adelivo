// src/components/ProfilePanel.tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import { IMaskInput } from "react-imask";

interface Props {
  onClose: () => void;
  onLogout: () => void;
}

interface ProfileData {
  firstName: string;
  lastName: string;
  phone: string;
  homeAddress: string;
  homeLat?: number | null;
  homeLng?: number | null;
  notifyNewOrder: boolean;
  notifyStatus: boolean;
  notifyCourier: boolean;
  notifyAddress: boolean;
  notifyTime: boolean;
  notifyComment: boolean;
  notifyOpComment: boolean;
  notifyItems: boolean;
}

export function ProfilePanel({ onClose, onLogout }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<ProfileData>({
    firstName: "", lastName: "", phone: "", homeAddress: "",
    homeLat: null, homeLng: null,
    notifyNewOrder: false, notifyStatus: false, notifyCourier: false,
    notifyAddress: false, notifyTime: false, notifyComment: false,
    notifyOpComment: false, notifyItems: false,
  });

  // Загрузка данных профиля
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Ошибка загрузки профиля");
      const data = await res.json();
      
      setFormData({
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        phone: data.phone || "",
        homeAddress: data.homeAddress || "",
        // Настройки уведомлений
        notifyNewOrder: !!data.notifyNewOrder,
        notifyStatus: !!data.notifyStatus,
        notifyCourier: !!data.notifyCourier,
        notifyAddress: !!data.notifyAddress,
        notifyTime: !!data.notifyTime,
        notifyComment: !!data.notifyComment,
        notifyOpComment: !!data.notifyOpComment,
        notifyItems: !!data.notifyItems,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // 🔥 Подключение Яндекс Подсказок (SuggestView)
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ymaps) {
      (window as any).ymaps.ready(() => {
        const ymaps = (window as any).ymaps;
        
        // Привязываемся к input по ID
        const suggestView = new ymaps.SuggestView("home-address-input", { 
          results: 5,
          boundedBy: [[55.55, 37.35], [55.95, 37.85]], // Ограничиваем подсказки Москвой и МО (опционально)
        });

        // Когда курьер выбрал адрес из выпадающего списка
        suggestView.events.add("select", (e: any) => {
          const selectedStr = e.get("item").value;
          
          setFormData(prev => ({ ...prev, homeAddress: selectedStr }));

          // Сразу получаем координаты выбранного адреса
          ymaps.geocode(selectedStr).then((res: any) => {
            const firstGeoObject = res.geoObjects.get(0);
            if (firstGeoObject) {
              const coords = firstGeoObject.geometry.getCoordinates();
              setFormData(prev => ({ ...prev, homeLat: coords[0], homeLng: coords[1] }));
            }
          });
        });
      });
    }
  }, [loading]); // Инициализируем после того, как инпут отрендерился

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Ошибка сохранения");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      
      // Закрываем панель после успешного сохранения
      setTimeout(() => onClose(), 1000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={s.panel}><div style={{ padding: 20 }}>Загрузка...</div></div>;

  return (
    <div style={s.panel} onClick={e => e.stopPropagation()}>
      <div style={s.header}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a18" }}>Мой профиль</div>
        <button onClick={onClose} style={s.closeBtn}>✕</button>
      </div>

      <div style={s.content}>
        {error && <div style={s.errorBadge}>{error}</div>}

        <div style={s.sectionTitle}>Личные данные</div>
        <div style={s.inputGroup}>
          <input style={s.input} placeholder="Имя" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
          <input style={s.input} placeholder="Фамилия" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <IMaskInput
            mask="+7 (000) 000-00-00"
            value={formData.phone}
            onAccept={(val: string) => setFormData({ ...formData, phone: val })}
            placeholder="Телефон"
            style={s.input}
          />
        </div>

        {/* 🔥 Поле адреса с привязанным Яндекс.SuggestView */}
        <div style={{ marginBottom: 24 }}>
          <div style={s.sectionTitle}>Домашний адрес (База курьера)</div>
          <input
            id="home-address-input"
            style={s.input}
            placeholder="Начните вводить адрес..."
            value={formData.homeAddress}
            onChange={e => {
              setFormData({ ...formData, homeAddress: e.target.value, homeLat: null, homeLng: null });
            }}
          />
          {formData.homeLat && formData.homeLng && (
            <div style={{ fontSize: 10, color: "#1a9e5c", marginTop: 4, fontWeight: 600 }}>
              ✓ Координаты найдены
            </div>
          )}
        </div>

        <div style={s.sectionTitle}>Уведомления (Push)</div>
        <div style={s.togglesList}>
          <Toggle label="Новые заказы" checked={formData.notifyNewOrder} onChange={v => setFormData({ ...formData, notifyNewOrder: v })} />
          <Toggle label="Изменение статуса" checked={formData.notifyStatus} onChange={v => setFormData({ ...formData, notifyStatus: v })} />
          <Toggle label="Смена курьера" checked={formData.notifyCourier} onChange={v => setFormData({ ...formData, notifyCourier: v })} />
          <Toggle label="Изменение адреса" checked={formData.notifyAddress} onChange={v => setFormData({ ...formData, notifyAddress: v })} />
          <Toggle label="Изменение времени" checked={formData.notifyTime} onChange={v => setFormData({ ...formData, notifyTime: v })} />
          <Toggle label="Комментарий оператора" checked={formData.notifyOpComment} onChange={v => setFormData({ ...formData, notifyOpComment: v })} />
        </div>

      </div>

      <div style={s.footer}>
        <button onClick={onLogout} style={s.logoutBtn}>Выйти</button>
        <button onClick={handleSave} disabled={saving} style={{ ...s.saveBtn, background: saved ? "#1a9e5c" : "#4a7aff" }}>
          {saving ? "Сохраняем..." : saved ? "✓ Сохранено" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

// Вспомогательный компонент для переключателей
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "8px 0", borderBottom: "1px solid #f5f4f0" }}>
      <span style={{ fontSize: 13, color: "#1a1a18", fontWeight: 500 }}>{label}</span>
      <input 
        type="checkbox" 
        checked={checked} 
        onChange={e => onChange(e.target.checked)} 
        style={{ accentColor: "#4a7aff", width: 18, height: 18, cursor: "pointer" }} 
      />
    </label>
  );
}

// Стили
const s: Record<string, React.CSSProperties> = {
  panel: { width: 340, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid #e8e6df", display: "flex", flexDirection: "column", maxHeight: "85vh", overflow: "hidden" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #f0efe9", background: "#fafaf8" },
  closeBtn: { background: "none", border: "none", fontSize: 16, color: "#a8a49c", cursor: "pointer" },
  content: { padding: 20, overflowY: "auto", flex: 1 },
  sectionTitle: { fontSize: 11, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".4px", fontWeight: 700, marginBottom: 8 },
  inputGroup: { display: "flex", gap: 8, marginBottom: 8 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e8e6df", fontSize: 13, background: "#fafaf8", outline: "none", color: "#1a1a18", fontWeight: 500 },
  togglesList: { display: "flex", flexDirection: "column" },
  footer: { padding: "16px 20px", borderTop: "1px solid #f0efe9", display: "flex", gap: 12, background: "#fafaf8" },
  logoutBtn: { flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #e8e6df", background: "#fff", color: "#d94040", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "10px", borderRadius: 8, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "background 0.2s" },
  errorBadge: { background: "rgba(217,64,64,0.1)", color: "#d94040", padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 16, fontWeight: 600 },
};