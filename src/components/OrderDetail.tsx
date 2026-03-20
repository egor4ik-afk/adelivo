// src/components/OrderDetail.tsx
"use client";
import { useState, useEffect } from "react";
import { Order, STATUS_OPTIONS, slotColor } from "@/lib/constants";

interface Props {
  selected: Order | null;
  couriers: { value: string; label: string }[];
  onClose: () => void;
  onUpdateSuccess: () => void;
  onPreviewGeo: (geo: {lat: number, lng: number} | null) => void;
  fixingAI: boolean;
  setFixingAI: (v: boolean) => void;
}

export function OrderDetail({ selected, couriers, onClose, onUpdateSuccess, onPreviewGeo, fixingAI, setFixingAI }: Props) {
  const [opComment, setOpComment] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editCourier, setEditCourier] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setOpComment(selected?.opComment ?? "");
    setEditStatus(selected?.status ?? "");
    setEditCourier(selected?.courier ?? "");
    setEditAddress(selected?.address ?? "");
    setSaved(false);
  }, [selected?.id]);

  if (!selected) return null;

  const hasChanges = editStatus !== selected.status || editCourier !== (selected.courier ?? "") || opComment !== (selected.opComment ?? "") || editAddress !== (selected.address ?? "");

  async function handleGeocode(mode: "ai" | "manual") {
    setFixingAI(true);
    try {
      const apiMode = mode === "ai" ? "ai_preview" : "manual_preview";
      const res = await fetch(`/api/orders/${selected!.id}/fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: apiMode, manualAddress: editAddress }) });
      if (res.ok) {
        const data = await res.json();
        if (mode === "ai" && data.suggestedAddress) {
          setEditAddress(data.suggestedAddress);
          setOpComment(prev => prev ? `${prev}\n[Старый адрес: ${selected!.address}]` : `[Старый адрес: ${selected!.address}]`);
        }
        if (data.geo?.lat) {
          onPreviewGeo({ lat: data.geo.lat, lng: data.geo.lng });
        } else alert("Координаты не найдены.");
      }
    } finally { setFixingAI(false); }
  }

  async function saveChanges() {
    setSaving(true);
    const isAddressChanged = editAddress !== (selected!.address ?? "");
    
    if (isAddressChanged) {
      await fetch(`/api/orders/${selected!.id}/fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "commit", manualAddress: editAddress }) });
    }

    const body: Record<string, string> = {};
    if (editStatus !== selected!.status) body.status = editStatus;
    if (editCourier !== (selected!.courier ?? "")) body.courier = editCourier;
    if (opComment !== (selected!.opComment ?? "")) body.opComment = opComment;
    if (isAddressChanged) body.address = editAddress;

    if (Object.keys(body).length > 0) {
      await fetch(`/api/orders/${selected!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }

    onPreviewGeo(null);
    onUpdateSuccess();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 700, fontFamily: "monospace" }}>{selected.externalId ?? selected.crmId}</div>
        <button style={{ background: "none", border: "none", color: "#a8a49c", fontSize: 14, cursor: "pointer" }} onClick={onClose}>✕</button>
      </div>

      {selected.isInvalid && <div style={{ fontSize: 11, padding: "5px 9px", borderRadius: 6, background: "rgba(217,64,64,0.08)", color: "#d94040", marginBottom: 10 }}>⚠ {selected.invalidReason ?? "Проблемный адрес"}</div>}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase", marginBottom: 4 }}>Адрес доставки</div>
        <textarea style={{ width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 12, resize: "none", background: "#fafaf8" }} rows={2} value={editAddress} onChange={e => setEditAddress(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button style={{ flex: 1, padding: 7, borderRadius: 6, border: "1px solid #e8e6df", fontSize: 11, cursor: "pointer" }} onClick={() => handleGeocode("manual")} disabled={fixingAI}>📍 На карте</button>
          <button style={{ flex: 1, padding: 7, borderRadius: 6, border: "none", background: "#7c4dff", color: "#fff", fontSize: 11, cursor: "pointer" }} onClick={() => handleGeocode("ai")} disabled={fixingAI}>{fixingAI ? "✨ Думает..." : "🪄 AI Исправить"}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ background: "#f5f4f0", borderRadius: 7, padding: "7px 9px" }}>
          <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase" }}>Слот</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: slotColor(selected) }}>{selected.slotRaw ?? `${selected.slotFrom}–${selected.slotTo}`}</div>
        </div>
        <div style={{ background: "#f5f4f0", borderRadius: 7, padding: "7px 9px" }}>
          <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase" }}>Стоимость</div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{selected.price ? `${selected.price} ₽` : "—"}</div>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase", marginBottom: 4 }}>Статус</div>
        <select style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid #e8e6df", fontSize: 12 }} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
          {STATUS_OPTIONS.slice(1).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase", marginBottom: 4 }}>Курьер</div>
        <div style={{ display: "flex", gap: 6 }}>
          <select style={{ flex: 1, padding: "7px 9px", borderRadius: 7, border: "1px solid #e8e6df", fontSize: 12 }} value={editCourier} onChange={e => setEditCourier(e.target.value)}>
            <option value="">— Не назначен —</option>
            {couriers.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      {selected.items && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase" }}>Состав</div><div style={{ fontSize: 12 }}>{selected.items}</div></div>}
      {selected.comment && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase" }}>Комментарий клиента</div><div style={{ fontSize: 12, color: "#6b6860" }}>{selected.comment}</div></div>}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase", marginBottom: 4 }}>Комментарий оператора</div>
        <textarea style={{ width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 12, resize: "none", background: "#fafaf8" }} rows={2} value={opComment} onChange={e => setOpComment(e.target.value)} />
      </div>

      <button 
        style={{ width: "100%", padding: 8, borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, background: saved ? "#1a9e5c" : hasChanges ? "#4a7aff" : "#e8e6df", color: hasChanges || saved ? "#fff" : "#a8a49c", cursor: hasChanges ? "pointer" : "default" }} 
        disabled={!hasChanges || saving} 
        onClick={saveChanges}
      >
        {saved ? "✓ Сохранено" : saving ? "Сохраняем..." : "Сохранить изменения"}
      </button>
    </div>
  );
}