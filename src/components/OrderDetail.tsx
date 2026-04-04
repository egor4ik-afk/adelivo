// src/components/OrderDetail.tsx
"use client";
import { useState, useEffect, useRef } from "react";
import { IMaskInput } from "react-imask";
import { Order, STATUS_OPTIONS, slotColor } from "@/lib/constants";

interface Props {
  selected: Order | null;
  couriers: { value: string; label: string }[];
  onClose: () => void;
  onUpdateSuccess: () => void;
  onPreviewGeo: (geo: { lat: number; lng: number } | null) => void;
  fixingAI: boolean;
  setFixingAI: (v: boolean) => void;
}

function CourierSelect({ value, onChange, couriers }: {
  value: string;
  onChange: (v: string) => void;
  couriers: { value: string; label: string }[];
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = couriers.filter(c =>
    c.value.toLowerCase().includes(search.toLowerCase()) ||
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  const current = couriers.find(c => c.value === value);
  const displayLabel = current?.label ?? (value || "— Не назначен —");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch(""); }}
        style={{
          width: "100%", padding: "7px 9px", borderRadius: 7,
          border: "1px solid #e8e6df", fontSize: 12, background: "#fafaf8",
          cursor: "pointer", textAlign: "left", display: "flex",
          justifyContent: "space-between", alignItems: "center",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {displayLabel}
        </span>
        <span style={{ fontSize: 9, color: "#a8a49c", marginLeft: 6, flexShrink: 0 }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0,
          background: "#fff", border: "1px solid #e8e6df", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 500,
          maxHeight: 220, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #f0efe9", flexShrink: 0 }}>
            <input
              autoFocus
              placeholder="Поиск курьера..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 11, outline: "none" }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            <div
              onMouseDown={() => { onChange(""); setOpen(false); }}
              style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", color: !value ? "#4a7aff" : "#a8a49c", background: !value ? "#f4f7ff" : "transparent", borderBottom: "1px solid #f5f4f0" }}
            >
              — Не назначен —
            </div>
            {filtered.map(c => (
              <div
                key={c.value}
                onMouseDown={() => { onChange(c.value); setOpen(false); }}
                style={{ padding: "7px 10px", fontSize: 12, cursor: "pointer", color: c.value === value ? "#4a7aff" : "#1a1a18", background: c.value === value ? "#f4f7ff" : "transparent", borderBottom: "1px solid #f5f4f0", fontWeight: c.value === value ? 600 : 400 }}
              >
                {c.label}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "10px", fontSize: 12, color: "#a8a49c", textAlign: "center" }}>Не найдено</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OrderDetail({ selected, couriers, onClose, onUpdateSuccess, onPreviewGeo, fixingAI, setFixingAI }: Props) {
  const [opComment, setOpComment] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editCourier, setEditCourier] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editRecipientPhone, setEditRecipientPhone] = useState("");
  // 🔥 ДОБАВЛЕН СТЕЙТ ЦЕНЫ
  const [editPrice, setEditPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const snapshot = useRef<{ status: string; courier: string; opComment: string; address: string; phone: string; price: string } | null>(null);

  useEffect(() => {
    if (!selected) return;
    const initialPhone = selected.recipientPhone || "";
    setOpComment(selected.opComment ?? "");
    setEditStatus(selected.status ?? "");
    setEditCourier(selected.courier ?? "");
    setEditAddress(selected.address ?? "");
    setEditRecipientPhone(initialPhone);
    setEditPrice(selected.price?.toString() || "");
    setSaved(false);
    snapshot.current = {
      status: selected.status ?? "",
      courier: selected.courier ?? "",
      opComment: selected.opComment ?? "",
      address: selected.address ?? "",
      phone: initialPhone,
      price: selected.price?.toString() || "",
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    if (typeof window === "undefined") return;

    const inputId = `order-address-${selected.id}`;

    const initSuggest = () => {
      const ymaps = (window as any).ymaps;
      if (!ymaps) return;
      ymaps.ready(() => {
        setTimeout(() => {
          const input = document.getElementById(inputId);
          if (input && !(input as any).isSuggestInitialized) {
            try {
              const suggestView = new ymaps.SuggestView(inputId, { results: 5 });
              suggestView.events.add("select", (e: any) => {
                const val = e.get("item").value;
                setEditAddress(val);
                
                ymaps.geocode(val, { results: 1 }).then((res: any) => {
                  const obj = res.geoObjects.get(0);
                  if (obj) {
                    const coords = obj.geometry.getCoordinates();
                    onPreviewGeo({ lat: coords[0], lng: coords[1] });
                  }
                }).catch((err: any) => console.warn("Ошибка геокодирования:", err));
              });
              (input as any).isSuggestInitialized = true;
            } catch (err) {
              console.warn("Suggest error:", err);
            }
          }
        }, 100);
      });
    };

    if ((window as any).ymaps) {
      initSuggest();
    } else {
      const script = document.createElement("script");
      const mapsKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY;
      const suggestKey = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_KEY;
      script.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${mapsKey}${suggestKey ? `&suggest_apikey=${suggestKey}` : ''}`;
      script.onload = initSuggest;
      document.head.appendChild(script);
    }
  }, [selected?.id]);

  if (!selected) return null;

  const snap = snapshot.current ?? {
    status: selected.status ?? "",
    courier: selected.courier ?? "",
    opComment: selected.opComment ?? "",
    address: selected.address ?? "",
    phone: "",
    price: "",
  };

  const hasChanges =
    editStatus !== snap.status ||
    editCourier !== snap.courier ||
    opComment !== snap.opComment ||
    editAddress !== snap.address ||
    editRecipientPhone !== snap.phone ||
    editPrice !== snap.price; // 🔥 ПРОВЕРЯЕМ ИЗМЕНЕНИЕ ЦЕНЫ

  async function handleGeocode(mode: "ai" | "manual") {
    setFixingAI(true);
    try {
      const res = await fetch(`/api/orders/${selected!.id}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: mode === "ai" ? "ai_preview" : "manual_preview", manualAddress: editAddress }),
      });
      if (res.ok) {
        const data = await res.json();
        if (mode === "ai" && data.suggestedAddress) {
          setEditAddress(data.suggestedAddress);
          setOpComment(prev => prev
            ? `${prev}\n[Старый адрес: ${selected!.address}]`
            : `[Старый адрес: ${selected!.address}]`
          );
        }
        if (data.geo?.lat) onPreviewGeo({ lat: data.geo.lat, lng: data.geo.lng });
        else alert("Координаты не найдены.");
      }
    } finally { setFixingAI(false); }
  }

  async function saveChanges() {
    setSaving(true);
    const isAddressChanged = editAddress !== snap.address;

    if (isAddressChanged) {
      await fetch(`/api/orders/${selected!.id}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "commit", manualAddress: editAddress }),
      });
    }

    const body: Record<string, any> = {};
    if (editStatus !== snap.status) body.status = editStatus;
    if (editCourier !== snap.courier) body.courier = editCourier;
    if (opComment !== snap.opComment) body.opComment = opComment;
    if (isAddressChanged) body.address = editAddress;
    if (editRecipientPhone !== snap.phone) body.recipientPhone = editRecipientPhone;
    // 🔥 ОТПРАВЛЯЕМ НОВУЮ ЦЕНУ НА СЕРВЕР
    if (editPrice !== snap.price) body.price = editPrice ? Number(editPrice) : null;

    if (Object.keys(body).length > 0) {
      await fetch(`/api/orders/${selected!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    snapshot.current = { status: editStatus, courier: editCourier, opComment, address: editAddress, phone: editRecipientPhone, price: editPrice };
    onPreviewGeo(null);
    onUpdateSuccess();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>
          {selected.externalId ?? selected.crmId}
        </div>
        <button style={{ background: "none", border: "none", color: "#a8a49c", fontSize: 14, cursor: "pointer" }} onClick={onClose}>✕</button>
      </div>

      {selected.isInvalid && (
        <div style={{ fontSize: 11, padding: "5px 9px", borderRadius: 6, background: "rgba(217,64,64,0.08)", color: "#d94040", marginBottom: 10 }}>
          ⚠ {selected.invalidReason ?? "Проблемный адрес"}
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>Адрес доставки</div>
        
        <textarea
          id={`order-address-${selected.id}`}
          value={editAddress}
          onChange={e => setEditAddress(e.target.value)}
          rows={3} 
          style={{ ...ta, resize: "vertical", minHeight: "60px" }}
        />
        
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button style={geoBtn} onClick={() => handleGeocode("manual")} disabled={fixingAI}>📍 На карте</button>
          <button style={aiBtn} onClick={() => handleGeocode("ai")} disabled={fixingAI}>
            {fixingAI ? "✨ Думает..." : "🪄 AI Исправить"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={card}>
          <div style={lbl}>Слот</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: slotColor(selected) }}>
            {selected.slotRaw ?? `${selected.slotFrom}–${selected.slotTo}`}
          </div>
        </div>
        <div style={card}>
          <div style={lbl}>Стоимость</div>
          {/* 🔥 РЕДАКТИРУЕМОЕ ПОЛЕ СТОИМОСТИ */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="number"
              value={editPrice}
              onChange={e => setEditPrice(e.target.value)}
              style={{ 
                width: "100%", padding: "4px 8px", borderRadius: 4, 
                border: "1px solid #e8e6df", fontSize: 12, background: "#fff", 
                outline: "none", fontWeight: 600
              }}
              placeholder="0"
            />
            <span style={{ fontSize: 12, color: "#6b6860", fontWeight: 600 }}>₽</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={lbl}>Статус</div>
          <select style={sel} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
            {STATUS_OPTIONS.filter(opt => !["GEOCODED", "INVALID_ADDRESS", "ALL"].includes(opt.value)).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={lbl}>Курьер</div>
          <CourierSelect value={editCourier} onChange={setEditCourier} couriers={couriers} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>Номер получателя</div>
        <IMaskInput
          mask="+7 (000) 000-00-00"
          value={editRecipientPhone}
          onAccept={(value: string) => setEditRecipientPhone(value)}
          style={inputPhone}
          placeholder="+7 (___) ___-__-__"
        />
      </div>

      {selected.items && (
        <div style={{ marginBottom: 10 }}>
          <div style={lbl}>Состав</div>
          <div style={{ fontSize: 12 }}>{selected.items}</div>
        </div>
      )}

      {selected.comment && (
        <div style={{ marginBottom: 10 }}>
          <div style={lbl}>Комментарий клиента</div>
          <div style={{ fontSize: 12, color: "#6b6860" }}>{selected.comment}</div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>Комментарий оператора</div>
        <textarea style={ta} rows={2} value={opComment} onChange={e => setOpComment(e.target.value)} placeholder="Заметка..." />
      </div>

      <button
        style={{
          width: "100%", padding: 8, borderRadius: 8, border: "none",
          fontSize: 12, fontWeight: 600,
          background: saved ? "#1a9e5c" : hasChanges ? "#4a7aff" : "#e8e6df",
          color: hasChanges || saved ? "#fff" : "#a8a49c",
          cursor: hasChanges ? "pointer" : "default",
          marginBottom: 16,
        }}
        disabled={!hasChanges || saving}
        onClick={saveChanges}
      >
        {saved ? "✓ Сохранено" : saving ? "Сохраняем..." : "Сохранить изменения"}
      </button>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 10, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 };
const card: React.CSSProperties = { background: "#f5f4f0", borderRadius: 7, padding: "7px 9px" };
const ta: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 12, resize: "none", background: "#fafaf8", outline: "none", display: "block", fontFamily: "Manrope, system-ui, sans-serif", boxSizing: "border-box" as const };
const sel: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid #e8e6df", fontSize: 12, background: "#fafaf8", outline: "none", cursor: "pointer" };
const inputPhone: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid #e8e6df", fontSize: 12, background: "#fafaf8", outline: "none", fontWeight: 600, color: "#1a1a18" };
const geoBtn: React.CSSProperties = { flex: 1, padding: 7, borderRadius: 6, border: "1px solid #e8e6df", background: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 };
const aiBtn: React.CSSProperties = { flex: 1, padding: 7, borderRadius: 6, border: "none", background: "#7c4dff", color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600 };