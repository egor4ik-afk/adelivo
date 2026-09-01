// src/components/manager/OrdersTab.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Order = {
  id: string;
  crmId: string;
  externalId: string | null;
  status: string;
  address: string | null;
  name: string | null;
  recipientPhone: string | null;
  items: string | null;
  price: number | null;
  slotFrom: string | null;
  slotTo: string | null;
  deliveryDate: string | null;
  courier: string | null;
  courierId: number | null;
  shop: string | null;
  onExchange: boolean;
  crmCreatedAt: string | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: "Новый", cls: "bg-[var(--color-surface)] text-[var(--color-text-2)]" },
  ASSEMBLING: { label: "В сборке", cls: "bg-yellow-100 text-yellow-800" },
  GEOCODED: { label: "Геокод", cls: "bg-[var(--color-surface)] text-[var(--color-text-2)]" },
  INVALID_ADDRESS: { label: "Адрес?", cls: "bg-red-100 text-red-700" },
  ASSIGNED: { label: "Назначен", cls: "bg-blue-100 text-blue-800" },
  IN_DELIVERY: { label: "В пути", cls: "bg-purple-100 text-purple-800" },
  DELIVERED: { label: "Доставлен", cls: "bg-green-100 text-green-800" },
  RETURNED: { label: "Возврат", cls: "bg-orange-100 text-orange-800" },
  CANCELLED: { label: "Отменён", cls: "bg-red-100 text-red-700" },
};

const FILTERS = [
  { id: "all", label: "Все" },
  { id: "unassigned", label: "Без курьера" },
  { id: "exchange", label: "На бирже" },
  { id: "active", label: "В работе" },
  { id: "done", label: "Завершённые" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Ошибка загрузки");
      setOrders(Array.isArray(d) ? d : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleExchange = async (o: Order) => {
    const next = !o.onExchange;
    if (next && o.courierId) {
      const ok = confirm(
        `Заказ назначен на курьера ${o.courier}. При выкладывании на биржу назначение снимется. Продолжить?`
      );
      if (!ok) return;
    }

    setBusy(o.id);
    setOrders((p) => p.map((x) => (x.id === o.id ? { ...x, onExchange: next } : x)));
    try {
      const res = await fetch(`/api/manager/orders/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onExchange: next }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Не удалось изменить");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить");
      load();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (o: Order) => {
    const isManual = o.crmId.startsWith("MAN-");
    const text = isManual
      ? `Удалить заказ ${o.externalId || o.crmId}? Действие необратимо.`
      : `Заказ ${o.externalId || o.crmId} пришёл из CRM — удалить его насовсем нельзя, поллинг вернёт его обратно. Перевести в «Отменён»?`;
    if (!confirm(text)) return;

    setBusy(o.id);
    try {
      const res = await fetch(`/api/manager/orders/${o.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось удалить");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    const done = ["DELIVERED", "RETURNED", "CANCELLED"];
    return orders.filter((o) => {
      if (filter === "unassigned" && (o.courierId || o.onExchange)) return false;
      if (filter === "exchange" && !o.onExchange) return false;
      if (filter === "active" && (done.includes(o.status) || !o.courierId)) return false;
      if (filter === "done" && !done.includes(o.status)) return false;
      if (!q.trim()) return true;
      const hay = `${o.externalId ?? ""} ${o.crmId} ${o.address ?? ""} ${o.name ?? ""} ${o.recipientPhone ?? ""} ${o.courier ?? ""} ${o.shop ?? ""}`.toLowerCase();
      return hay.includes(q.toLowerCase().trim());
    });
  }, [orders, filter, q]);

  const slot = (o: Order) => (o.slotFrom && o.slotTo ? `${o.slotFrom}–${o.slotTo}` : o.slotFrom || "—");

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] px-4 py-3 text-[13px] font-medium">
          {error}
        </div>
      )}

      {/* Панель */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Номер, адрес, телефон, курьер"
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] min-w-[220px] flex-1"
        />
        <div className="flex bg-[var(--color-border)] p-1 rounded-xl gap-1 overflow-x-auto hide-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold whitespace-nowrap transition-all ${
                filter === f.id
                  ? "bg-[var(--color-card)] shadow-sm text-[var(--color-text)]"
                  : "text-[var(--color-text-2)] hover:text-[var(--color-text)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={load} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-[12px] font-bold text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors">
          Обновить
        </button>
        <span className="text-[12px] text-[var(--color-text-3)]">{shown.length} из {orders.length}</span>
      </div>

      {loading ? (
        <p className="text-center text-[var(--color-text-3)] py-10 animate-pulse">Загрузка заказов…</p>
      ) : shown.length === 0 ? (
        <p className="text-center text-[var(--color-text-3)] py-10">Ничего не нашлось</p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((o) => {
            const st = STATUS[o.status] ?? { label: o.status, cls: "bg-[var(--color-surface)] text-[var(--color-text-2)]" };
            return (
              <div
                key={o.id}
                className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-3 sm:p-4 flex flex-wrap items-start gap-3"
              >
                {/* Основное */}
                <div className="flex-1 min-w-[220px]">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-[14px] text-[var(--color-text)]">
                      №{o.externalId || o.crmId}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${st.cls}`}>
                      {st.label}
                    </span>
                    {o.shop && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[var(--color-border)] text-[var(--color-text-3)]">
                        {o.shop}
                      </span>
                    )}
                    {o.onExchange && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                        🌐 на бирже
                      </span>
                    )}
                  </div>

                  <div className="text-[13px] text-[var(--color-text)] leading-snug">
                    {o.address || "адрес не указан"}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-3)] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {o.name && <span>{o.name}</span>}
                    {o.recipientPhone && <span>{o.recipientPhone}</span>}
                    <span>{o.deliveryDate || "—"} · {slot(o)}</span>
                    {o.price != null && <span>{o.price} ₽</span>}
                  </div>
                  {o.items && (
                    <div className="text-[11px] text-[var(--color-text-2)] mt-1 line-clamp-1">{o.items}</div>
                  )}
                </div>

                {/* Курьер */}
                <div className="min-w-[130px]">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-3)] font-bold mb-0.5">
                    Курьер
                  </div>
                  <div className={`text-[13px] font-semibold ${o.courier ? "text-[var(--color-text)]" : "text-[var(--color-text-3)]"}`}>
                    {o.courier || "не назначен"}
                  </div>
                </div>

                {/* Действия */}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={() => toggleExchange(o)}
                    disabled={busy === o.id}
                    title={o.onExchange ? "Снять с биржи" : "Выложить на биржу: заказ увидят все допущенные курьеры"}
                    className={`px-3 py-2 rounded-lg text-[12px] font-bold border transition-colors disabled:opacity-50 ${
                      o.onExchange
                        ? "border-teal-300 bg-teal-50 text-teal-800"
                        : "border-[var(--color-border)] text-[var(--color-text-2)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {o.onExchange ? "Снять с биржи" : "На биржу"}
                  </button>

                  <Link
                    href={`/manager/orders/${o.id}/edit`}
                    title="Редактировать"
                    aria-label="Редактировать"
                    className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-3)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </Link>

                  <button
                    onClick={() => remove(o)}
                    disabled={busy === o.id}
                    title={o.crmId.startsWith("MAN-") ? "Удалить заказ" : "Отменить заказ (из CRM удалить нельзя)"}
                    aria-label="Удалить"
                    className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-3)] hover:text-[var(--color-red)] hover:border-[var(--color-red)] transition-colors disabled:opacity-50"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-[var(--color-text-3)] leading-relaxed">
        Заказ на бирже виден курьерам, допущенным к работе, и снимается только вручную
        или когда его заберут. Заказы из CRM не удаляются физически — поллинг вернёт их
        обратно, поэтому они переводятся в «Отменён».
      </p>
    </div>
  );
}
