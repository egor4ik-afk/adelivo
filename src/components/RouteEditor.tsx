// src/components/RouteEditor.tsx
"use client";
import { useState, useEffect } from "react";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  NEW: { label: "Новый", color: "#d94040", bg: "#fef2f2" },
  ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
  IN_DELIVERY: { label: "🚀 В пути", color: "#10b981", bg: "#ecfdf5" },
  DELIVERED: { label: "✅ Доставлен", color: "#6b6860", bg: "#f5f4f0" },
  RETURNED: { label: "↩️ Возврат", color: "#d94040", bg: "#fef2f2" },
  CANCELLED: { label: "❌ Отменен", color: "#a8a49c", bg: "#f5f4f0" }
};

export function RouteEditor({ 
  route, routeId, routeName, routeLink, initialOrders, globalFreeOrders, 
  courierId, routesDate, isMobile, onSaved, onStatusChange, onOpenDetail 
}: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasChanges) {
      setOrders([...initialOrders].sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0)));
    }
  }, [initialOrders, hasChanges]);

  const move = (idx: number, dir: number) => {
    const arr = [...orders];
    [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
    setOrders(arr);
    setHasChanges(true);
  };

  const remove = (id: string) => {
    if (window.confirm("Убрать точку из маршрута?")) {
      setOrders(prev => prev.filter(o => o.id !== id));
      setHasChanges(true);
    }
  };

  const add = (id: string) => {
    const orderToAdd = globalFreeOrders.find((x: any) => x.id === id);
    if (orderToAdd) {
      setOrders(prev => [...prev, orderToAdd]);
      setHasChanges(true);
    }
  };

  const cancelChanges = () => {
    setOrders([...initialOrders].sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0)));
    setHasChanges(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/routes/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: orders.map(o => o.id),
          courierId,
          routeDate: routesDate,
          oldRouteId: routeId
        })
      });
      setHasChanges(false);
      onSaved();
    } catch (e) {
      alert("Ошибка сохранения маршрута");
    } finally {
      setSaving(false);
    }
  };

  // Исключаем точки, которые уже добавлены в этот маршрут
  const availableToADD = globalFreeOrders.filter((free: any) => !orders.find(lo => lo.id === free.id));

  return (
    <div style={{ border: hasChanges ? "2px solid #4a7aff" : "1px solid #f0efe9", borderRadius: 12, padding: isMobile ? 12 : 16, background: hasChanges ? "#f4f7ff" : "#fff", transition: "all 0.3s", position: "relative" }}>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            Маршрут {routeName} {hasChanges && <span style={{ color: "#4a7aff", fontSize: 12, marginLeft: 8 }}>*не сохранено</span>}
          </h4>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <span style={{fontSize: 12, fontWeight: 600, color: "#6b6860"}}>Время прибытия на базу:</span>
            <input 
              type="time" 
              defaultValue={route?.baseArrivalTime || ""} 
              onBlur={async (e) => {
                 // Оператор редактирует время прямо здесь
                 try {
                   await fetch(`/api/routes/${routeId}`, { 
                     method: "PATCH", headers: {"Content-Type": "application/json"}, 
                     body: JSON.stringify({ baseArrivalTime: e.target.value }) 
                   });
                 } catch (err) {}
              }}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #e8e6df", outline: "none", fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", width: isMobile ? "100%" : "auto" }}>
          {routeLink && !hasChanges && (
            <a href={routeLink} target="_blank" style={{ flex: isMobile ? 1 : "none", textAlign: "center", fontSize: 11, background: "#facc15", color: "#1a1a18", padding: "8px 12px", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>
              📍 Яндекс Карты
            </a>
          )}
          {hasChanges && (
            <>
              <button onClick={cancelChanges} disabled={saving} style={{ flex: isMobile ? 1 : "none", background: "#fff", color: "#1a1a18", border: "1px solid #e8e6df", padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Отменить
              </button>
              <button onClick={save} disabled={saving} style={{ flex: isMobile ? 1 : "none", background: "#4a7aff", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 4px 12px rgba(74,122,255,0.3)" }}>
                {saving ? "Сохранение..." : "💾 Сохранить"}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {orders.map((o, index) => {
          const st = STATUS_MAP[o.status] || STATUS_MAP.NEW;
          const phone = o.recipientPhone || "—";

          return (
            <div key={o.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e8e6df", padding: 14, display: "flex", flexDirection: "column", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                    <button onClick={() => move(index, -1)} disabled={index === 0} style={{ background: "none", border: "none", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.2 : 1, fontSize: 14, padding: 0, lineHeight: 1 }}>▲</button>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1a1a18", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{index + 1}</div>
                    <button onClick={() => move(index, 1)} disabled={index === orders.length - 1} style={{ background: "none", border: "none", cursor: index === orders.length - 1 ? "default" : "pointer", opacity: index === orders.length - 1 ? 0.2 : 1, fontSize: 14, padding: 0, lineHeight: 1 }}>▼</button>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId ?? o.crmId}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>{o.slotRaw}</div>
                  </div>
                </div>

                <select value={o.status} onChange={(e) => onStatusChange(o.id, e.target.value)} style={{ background: st.bg, color: st.color, border: "none", padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, outline: "none", cursor: "pointer", maxWidth: 110 }}>
                  <option value="NEW">Новый</option>
                  <option value="ASSIGNED">Назначен</option>
                  <option value="IN_DELIVERY">🚀 В пути</option>
                  <option value="DELIVERED">✅ Доставлен</option>
                  <option value="RETURNED">↩️ Возврат</option>
                  <option value="CANCELLED">❌ Отменен</option>
                </select>
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", marginBottom: 10, lineHeight: 1.4, flex: 1 }}>{o.address}</div>

              {/* 🔥 ФОТООТЧЕТ ОТ КУРЬЕРА ДЛЯ ОПЕРАТОРА */}
              {o.photoUrl && (
                <div style={{ marginBottom: 12, position: "relative" }}>
                  <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginBottom: 4 }}>
                    ✅ Прикреплено фото:
                  </div>
                  <a href={o.photoUrl} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                    <img 
                      src={o.photoUrl} 
                      alt="Фотоотчет курьера" 
                      style={{ 
                        width: "100%", 
                        borderRadius: 8, 
                        maxHeight: 180, 
                        objectFit: "cover",
                        border: "1px solid #e8e6df"
                      }} 
                    />
                  </a>
                </div>
              )}

              <div style={{ background: "#fafaf8", borderRadius: 8, padding: 10, border: "1px solid #f0efe9" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase" }}>Получатель</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a18" }}>
                    {phone !== "—" ? <a href={`tel:${phone}`} style={{ color: "#4a7aff", textDecoration: "none" }}>{phone}</a> : "—"}
                  </div>
                </div>
                {o.items && <div style={{ fontSize: 11, color: "#6b6860", borderTop: "1px solid #f0efe9", paddingTop: 6 }}>{o.items}</div>}
              </div>

              <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", gap: 8, borderTop: "1px dashed #e8e6df", alignItems: "center" }}>
                <button onClick={() => onOpenDetail(o)} style={{ flex: 1, background: "#f5f4f0", color: "#1a1a18", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>✏️ Открыть</button>
                <button onClick={() => remove(o.id)} style={{ flex: 1, background: "rgba(217, 64, 64, 0.08)", color: "#d94040", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>❌ Убрать</button>
              </div>
            </div>
          );
        })}
      </div>

      {availableToADD.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e8e6df" }}>
          <select value="" onChange={(e) => add(e.target.value)} style={{ width: "100%", maxWidth: isMobile ? "100%" : 450, background: "rgba(74, 122, 255, 0.08)", color: "#4a7aff", border: "none", padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, outline: "none", cursor: "pointer", textOverflow: "ellipsis" }}>
            <option value="" disabled>➕ Добавить свободную точку в маршрут...</option>
            {availableToADD.map((free: any) => {
              const belongsToOther = free.courierId && free.courierId !== courierId;
              const suffix = belongsToOther ? `(У курьера: ${free.courier})` : (!free.courierId ? "(Новый / Без курьера)" : "");
              
              return (
                <option key={free.id} value={free.id}>
                  {free.slotRaw} · {free.address?.slice(0, 30)}... {suffix}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}
