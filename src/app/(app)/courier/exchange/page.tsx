"use client";
// src/app/(app)/courier/exchange/page.tsx
// Биржа: свободные заказы, которые может взять любой допущенный курьер.

import { useEffect, useState } from "react";

type Order = {
  id: string; externalId: string | null; crmId: string;
  address: string | null; lat: number | null; lng: number | null;
  items: string | null; price: number | null; costPrice: number | null;
  comment: string | null; slotFrom: string | null; slotTo: string | null;
  deliveryDate: string | null; shop: string | null; exchangeAt: string | null;
};

export default function ExchangePage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [canTake, setCanTake] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/courier/exchange");
      const d = await res.json();
      setOrders(d.orders ?? []);
      setCanTake(!!d.canTake);
      setReason(d.reason ?? null);
    } catch {
      setNote("Не удалось загрузить биржу");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Заказы разбирают, поэтому список обновляем сам
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const take = async (o: Order) => {
    if (!confirm(`Взять заказ ${o.externalId || o.crmId}?\n${o.address ?? ""}`)) return;
    setBusy(o.id);
    setNote(null);
    try {
      const res = await fetch(`/api/courier/exchange/${o.id}/take`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось взять заказ");
      setNote("Заказ ваш — он появился в маршрутах");
      setOrders((p) => p.filter((x) => x.id !== o.id));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Не удалось взять заказ");
      load();
    } finally {
      setBusy(null);
    }
  };

  const slot = (o: Order) => (o.slotFrom && o.slotTo ? `${o.slotFrom}–${o.slotTo}` : o.slotFrom || "время не указано");

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", padding: "16px 12px 90px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--color-text)", marginBottom: 4 }}>
        Биржа заказов
      </h1>
      <p style={{ fontSize: 12, color: "var(--color-text-3)", marginBottom: 16, lineHeight: 1.6 }}>
        Свободные заказы. Кто взял первым — того и заказ.
      </p>

      {reason && (
        <div style={{
          background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)",
          color: "var(--color-warn-text)", borderRadius: 12, padding: "12px 14px",
          fontSize: 13, marginBottom: 14, lineHeight: 1.6,
        }}>
          {reason}
        </div>
      )}

      {note && (
        <div style={{
          background: "var(--color-ok-bg)", border: "1px solid var(--color-ok-border)",
          color: "var(--color-ok-text)", borderRadius: 12, padding: "12px 14px",
          fontSize: 13, marginBottom: 14,
        }}>
          {note}
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: "center", color: "var(--color-text-3)", padding: "40px 0" }}>Загрузка…</p>
      ) : orders.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--color-text-3)", padding: "40px 0", fontSize: 14 }}>
          Сейчас свободных заказов нет
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {orders.map((o) => (
            <div key={o.id} style={{
              background: "var(--color-card)", border: "1px solid var(--color-border)",
              borderRadius: 14, padding: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: "var(--color-text)" }}>
                  №{o.externalId || o.crmId}
                </span>
                {o.costPrice != null && (
                  <span style={{ fontWeight: 800, fontSize: 15, color: "var(--color-green)" }}>
                    {o.costPrice} ₽
                  </span>
                )}
              </div>

              <div style={{ fontSize: 14, color: "var(--color-text)", lineHeight: 1.4, marginBottom: 6 }}>
                {o.address || "адрес не указан"}
              </div>

              <div style={{ fontSize: 12, color: "var(--color-text-3)", marginBottom: 10, lineHeight: 1.6 }}>
                {o.deliveryDate ? `${o.deliveryDate} · ` : ""}{slot(o)}
                {o.shop ? ` · ${o.shop}` : ""}
                {o.items ? <><br />{o.items}</> : null}
                {o.comment ? <><br />{o.comment}</> : null}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => take(o)}
                  disabled={!canTake || busy === o.id}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 10, border: "none",
                    fontWeight: 800, fontSize: 14, cursor: canTake ? "pointer" : "not-allowed",
                    background: canTake ? "var(--color-accent)" : "var(--color-border)",
                    color: canTake ? "#fff" : "var(--color-text-3)",
                    fontFamily: "inherit",
                  }}
                >
                  {busy === o.id ? "Берём…" : "Взять заказ"}
                </button>
                {o.lat && o.lng && (
                  <a
                    href={`https://yandex.ru/maps/?pt=${o.lng},${o.lat}&z=16&l=map`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "12px 14px", borderRadius: 10,
                      border: "1px solid var(--color-border)", color: "var(--color-text-2)",
                      fontSize: 14, fontWeight: 700, textDecoration: "none",
                    }}
                  >
                    На карте
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}