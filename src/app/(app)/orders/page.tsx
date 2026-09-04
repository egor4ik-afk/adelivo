"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { IMaskInput } from "react-imask";

interface Order {
  id: string;
  crmId: string;
  externalId: string | null;
  status: string;
  shop: string | null;
  name: string | null;
  recipientPhone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  price: number | null;
  wrongPrice?: boolean;
  costPrice: number | null;
  courier: string | null;
  comment: string | null;
  opComment: string | null;
  items: string | null;
  slotFrom: string | null;
  slotTo: string | null;
  slotRaw: string | null;
  deliveryType: string | null;
  deliveryDate: string | null;
  isInvalid: boolean;
  invalidReason: string | null;
  crmCreatedAt: string | null;
  updatedAt?: string;
  changedAt?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый", ASSIGNED: "Назначен",ASSEMBLING: "В сборке", IN_DELIVERY: "В пути",
  DELIVERED: "Доставлен", RETURNED: "Возврат", CANCELLED: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "var(--color-text-3)", ASSIGNED: "var(--color-accent)",ASSEMBLING: "#f59e0b", IN_DELIVERY: "#7c4dff",
  DELIVERED: "#1a9e5c", RETURNED: "#c8780a", CANCELLED: "#d94040",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Хелпер для проверки игнорируемого адреса
const isIgnoredAddress = (address?: string | null) => {
  if (!address) return false;
  return address.toLowerCase().includes("большой афанасьевский 39");
};

type SortKey = keyof Order | "costPriceDisplay";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [costLoaders, setCostLoaders] = useState<Record<string, boolean>>({});
  const [localCosts, setLocalCosts] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massUpdating, setMassUpdating] = useState(false);

  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [fStatus, setFStatus] = useState("ALL");

  // Подтягиваем сохраненную дату при загрузке
  useEffect(() => {
    const savedDate = localStorage.getItem("orders_filterDate");
    if (savedDate) setFilterDate(savedDate);
  }, []);

  // Функция для обновления даты и сохранения в память
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setFilterDate(newDate);
    localStorage.setItem("orders_filterDate", newDate);
  };
  const [fCourier, setFCourier] = useState("ALL");
  // Магазинов стало несколько и в разных городах — без этого фильтра
  // список приходилось разбирать глазами по колонке «Магазин»
  const [fShop, setFShop] = useState("ALL");
  const [fSearch, setFSearch] = useState("");

  const [sortConfig, setSortConfig] = useState<{ key: SortKey | null, direction: 'asc' | 'desc' }>({ key: 'changedAt', direction: 'desc' });

  const [editingCell, setEditingCell] = useState<{ id: string, field: 'price' | 'costPrice' | 'recipientPhone' } | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      if (res.ok) {
        setOrders(await res.json());
        setSelectedIds(new Set());
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOrders(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/cron/sync");
      await fetchOrders();
    } catch (e) { console.error(e); }
    finally { setSyncing(false); }
  };

  const handleUpdateCost = async (orderId: string) => {
    setCostLoaders(prev => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`/api/orders/${orderId}/cost`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setLocalCosts(prev => ({ ...prev, [orderId]: data.costPrice }));
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch (e) {
      alert("Ошибка запроса.");
    } finally {
      setCostLoaders(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const handleMassUpdateCost = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Рассчитать себестоимость для ${selectedIds.size} заказов?`)) return;

    setMassUpdating(true);
    try {
      const res = await fetch("/api/orders/bulk-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      alert(`Готово! Успешно: ${data.success}, Ошибок: ${data.failed}`);
      await fetchOrders();
    } catch (e) {
      alert("Ошибка при массовом обновлении");
    } finally {
      setMassUpdating(false);
      setSelectedIds(new Set());
    }
  };

  const handleEditClick = (id: string, field: 'price' | 'costPrice' | 'recipientPhone', currentValue: number | string | null) => {
    setEditingCell({ id, field });
    setEditValue(currentValue ? String(currentValue) : "");
  };

  const handleEditSave = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;

    let val: number | string | null = editValue === "" ? null : editValue;
    if (field === 'price' || field === 'costPrice') {
      val = editValue === "" ? null : parseFloat(editValue.replace(",", "."));
    }

    setOrders(prev => prev.map(o => o.id === id ? {
      ...o,
      [field]: val,
      ...(field === 'price' ? { wrongPrice: false } : {})
    } : o));
    setEditingCell(null);

    try {
      await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: val })
      });
    } catch (e) {
      console.error("Ошибка при сохранении значения:", e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleEditSave();
    if (e.key === 'Escape') setEditingCell(null);
  };

  const dateOrders = orders.filter(o => {
    const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
    return oDate === filterDate;
  });

  const couriers = useMemo(() =>
    Array.from(new Set(orders.map(o => o.courier).filter(Boolean) as string[])).sort(),
    [orders]
  );

  // Список для фильтра собираем из самих заказов, а не из справочника:
  // так в нём заведомо только те магазины, чьи заказы человек видит
  const shops = useMemo(() =>
    Array.from(new Set(orders.map(o => o.shop).filter(Boolean) as string[])).sort(),
    [orders]
  );

  // Названия магазинов приходят слагами. Знакомые подписываем по-человечески,
  // незнакомый показываем как есть — новый магазин не должен пропадать
  // из фильтра только потому, что его сюда не добавили.
  const shopLabel = (slug: string) =>
    slug === "kaktusfiori" || slug === "meura-flowers" ? "🌸 Meura"
      : slug === "bunch" ? "📦 Bunch"
      : slug;

  const filtered = useMemo(() => {
    return dateOrders.filter(o => {
      if (fStatus !== "ALL" && o.status !== fStatus) return false;
      if (fCourier !== "ALL" && (o.courier || "UNASSIGNED") !== fCourier) return false;
      if (fShop !== "ALL" && (o.shop || "") !== fShop) return false;
      if (fSearch) {
        const q = fSearch.toLowerCase();
        return (o.externalId || "").toLowerCase().includes(q) ||
          (o.address || "").toLowerCase().includes(q) ||
          (o.courier || "").toLowerCase().includes(q) ||
          (o.name || "").toLowerCase().includes(q) ||
          (o.recipientPhone || "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [dateOrders, fStatus, fCourier, fShop, fSearch]);

  const sortedAndFiltered = useMemo(() => {
    let result = [...filtered];

    result.sort((a, b) => {
      // 1. Игнорируемые адреса всегда смещаем вниз
      const aIgnored = isIgnoredAddress(a.address);
      const bIgnored = isIgnoredAddress(b.address);

      if (aIgnored && !bIgnored) return 1;
      if (!aIgnored && bIgnored) return -1;

      // 2. Стандартная сортировка для остальных
      if (sortConfig.key) {
        let aVal: any = a[sortConfig.key as keyof Order];
        let bVal: any = b[sortConfig.key as keyof Order];

        if (sortConfig.key === "costPriceDisplay") {
          aVal = a.costPrice || localCosts[a.id] || 0;
          bVal = b.costPrice || localCosts[b.id] || 0;
        } else if (sortConfig.key === "externalId") {
          aVal = a.externalId || a.crmId;
          bVal = b.externalId || b.crmId;
        } else if (sortConfig.key === "changedAt") {
          aVal = new Date(a.changedAt || a.updatedAt || 0).getTime();
          bVal = new Date(b.changedAt || b.updatedAt || 0).getTime();
        }

        if (aVal === bVal) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        return sortConfig.direction === 'asc' ? (aVal < bVal ? -1 : 1) : (aVal > bVal ? -1 : 1);
      }
      return 0;
    });

    return result;
  }, [filtered, sortConfig, localCosts]);

  // Заказы, которые реально участвуют в подсчете и массовом выделении (исключая игнорируемые)
  const countableOrders = useMemo(() => sortedAndFiltered.filter(o => !isIgnoredAddress(o.address)), [sortedAndFiltered]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Выделяем только те, что входят в countableOrders
    if (e.target.checked) setSelectedIds(new Set(countableOrders.map(o => o.id)));
    else setSelectedIds(new Set());
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const isAllSelected = countableOrders.length > 0 && selectedIds.size === countableOrders.length;

  const HEADERS: { label: string, key: SortKey | null }[] = [
    { label: "ID", key: "externalId" },
    { label: "Магазин", key: "shop" },
    { label: "Статус", key: "status" },
    { label: "Курьер", key: "courier" },
    { label: "Имя", key: "name" },
    { label: "Телефон", key: "recipientPhone" },
    { label: "Адрес", key: "address" },
    { label: "Слот", key: "slotRaw" },
    { label: "Себ-ть", key: "costPriceDisplay" },
    { label: "Сумма", key: "price" },
    { label: "Изменён", key: "changedAt" },
    { label: "Карта", key: null }
  ];

  return (
    <div style={{ fontFamily: "Manrope, system-ui, sans-serif", background: "var(--color-bg)", minHeight: "100vh", paddingBottom: selectedIds.size > 0 ? 80 : 0 }}>

      {/* Шапка */}
      <div style={{ background: "var(--color-card)", borderBottom: "1px solid var(--color-border)", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 16, overflowX: "auto" }}>
        {/* Логотип и кнопки «Дашборд» и «Курьеры» убраны: они дублировали
            общую AppTopBar, которая теперь есть и на этой странице. Сама
            полоса и её высота оставлены как были — прошлый раз я снёс её
            целиком, и страница из-за этого визуально просела. */}
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap" }}>Все заказы</span>
        <div style={{ flex: 1 }} />
        <button onClick={handleSync} disabled={syncing} style={{ ...syncBtn, background: syncing ? "var(--color-border)" : "var(--color-contrast-bg)" }}>
          {syncing ? "Синхронизация..." : "↻ Обновить из CRM"}
        </button>
      </div>

      {/* Фильтры */}
      <div style={{ padding: "16px 24px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={filterDate} onChange={handleDateChange} style={inputStyle} />
        <input placeholder="Поиск по ID, адресу, имени..." value={fSearch} onChange={e => setFSearch(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inputStyle}>
          <option value="ALL">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fCourier} onChange={e => setFCourier(e.target.value)} style={inputStyle}>
          <option value="ALL">Все курьеры</option>
          <option value="UNASSIGNED">Не назначен</option>
          {couriers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fShop} onChange={e => setFShop(e.target.value)} style={inputStyle}>
          <option value="ALL">Все магазины</option>
          {shops.map(sl => <option key={sl} value={sl}>{shopLabel(sl)}</option>)}
        </select>
      </div>

      {/* СТАТИСТИКА ЗАКАЗОВ */}
      <div style={{ padding: "0 24px 16px", display: "flex", gap: 16, fontSize: 13 }}>
        <div style={{ background: "var(--color-card)", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}>
          <span style={{ color: "var(--color-text-3)" }}>Отфильтровано:</span> <span style={{ fontWeight: 700, color: "var(--color-accent)" }}>{countableOrders.length}</span>
        </div>
        {selectedIds.size > 0 && (
          <div style={{ background: "#e8f4eb", padding: "6px 12px", borderRadius: 8, border: "1px solid #cce3d3" }}>
            <span style={{ color: "#1a9e5c" }}>Выбрано:</span> <span style={{ fontWeight: 700, color: "#1a9e5c" }}>{selectedIds.size}</span>
          </div>
        )}
      </div>

      {/* Таблица */}
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ background: "var(--color-card)", borderRadius: 10, border: "1px solid var(--color-border)", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)", userSelect: "none" }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", width: 40 }}>
                    <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} style={{ cursor: "pointer" }} />
                  </th>
                  {HEADERS.map(h => (
                    <th
                      key={h.label}
                      style={{ ...thStyle, cursor: h.key ? "pointer" : "default" }}
                      onClick={() => h.key && handleSort(h.key)}
                      title={h.key ? "Нажмите для сортировки" : ""}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {h.label}
                        {sortConfig.key === h.key && (
                          <span style={{ fontSize: 10, color: "var(--color-accent)" }}>{sortConfig.direction === 'asc' ? "▲" : "▼"}</span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={13} style={{ padding: 32, textAlign: "center", color: "var(--color-text-3)" }}>Загрузка...</td></tr>
                ) : sortedAndFiltered.map((o, i) => {
                  const statusColor = STATUS_COLORS[o.status] ?? "var(--color-text-3)";
                  const isSelected = selectedIds.has(o.id);
                  const displayCost = o.costPrice || localCosts[o.id];
                  const ignored = isIgnoredAddress(o.address);

                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--color-bg)", background: isSelected ? "#f4f7ff" : (i % 2 === 0 ? "var(--color-card)" : "var(--color-surface)"), opacity: ignored ? 0.6 : 1 }}>
                      <td style={{ padding: "10px 14px" }}>
                        <input type="checkbox" checked={isSelected} disabled={ignored} onChange={() => toggleSelectOne(o.id)} style={{ cursor: ignored ? "not-allowed" : "pointer" }} />
                      </td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "var(--color-text-2)" }}>{o.externalId ?? o.crmId}</td>

                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>
                        {/* Раньше здесь было «всё, что не Meura — это Bunch»:
                            заказы Тбилиси и любого нового магазина
                            подписывались как Bunch. Теперь слаг показывается
                            как есть, если он не из двух известных. */}
                        <span style={{
                          color: o.shop === "kaktusfiori" || o.shop === "meura-flowers" ? "#d63384"
                            : o.shop === "bunch" ? "#0d6efd"
                            : "var(--color-text-2)",
                        }}>
                          {o.shop ? shopLabel(o.shop) : "—"}
                        </span>
                      </td>

                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${statusColor}18`, color: statusColor }}>
                          {STATUS_LABELS[o.status] || o.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: o.courier ? "var(--color-text)" : "#d94040" }}>{o.courier || "—"}</td>

                      <td style={{ padding: "10px 14px", fontWeight: 500 }}>{o.name || "—"}</td>

                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", fontFamily: "monospace", color: "var(--color-accent)" }}>
                        {editingCell?.id === o.id && editingCell?.field === "recipientPhone" ? (
                          <IMaskInput
                            mask="+7 (000) 000-00-00"
                            autoFocus
                            value={editValue}
                            onAccept={(value: string) => setEditValue(value)}
                            onBlur={handleEditSave}
                            onKeyDown={handleKeyDown}
                            style={inlineInputStyle}
                            placeholder="+7 (___) ___-__-__"
                          />
                        ) : (
                          <span
                            onClick={() => handleEditClick(o.id, "recipientPhone", o.recipientPhone)}
                            title="Нажмите, чтобы изменить"
                            style={{ borderBottom: "1px dashed var(--color-text-3)", cursor: "pointer", display: "inline-block", minHeight: 20 }}
                          >
                            {o.recipientPhone || "—"}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "10px 14px", maxWidth: 260 }}>{o.address || "—"}</td>
                      <td style={{ padding: "10px 14px", color: "var(--color-text-2)" }}>{o.slotRaw || "—"}</td>

                      <td style={{ padding: "10px 14px", minWidth: 90 }}>
                        {editingCell?.id === o.id && editingCell?.field === "costPrice" ? (
                          <input
                            autoFocus
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={handleEditSave}
                            onKeyDown={handleKeyDown}
                            style={inlineInputStyle}
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 24 }}>
                            {displayCost ? (
                              <div
                                onClick={() => handleEditClick(o.id, "costPrice", displayCost)}
                                style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#1a9e5c", fontWeight: 700, borderBottom: "1px dashed var(--color-text-3)" }}
                                title="Изменить"
                              >
                                {displayCost} ₽ <span style={{ fontSize: 10, opacity: 0.6 }}>✏️</span>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleUpdateCost(o.id); }}
                                  disabled={costLoaders[o.id] || !o.price}
                                  style={calcBtnStyle(costLoaders[o.id] || !o.price)}
                                >
                                  {costLoaders[o.id] ? "..." : "Считать"}
                                </button>
                                <span onClick={() => handleEditClick(o.id, "costPrice", null)} style={{ cursor: "pointer", fontSize: 12, opacity: 0.5 }} title="Ввести вручную">✏️</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "10px 14px", fontWeight: o.wrongPrice ? 800 : 600, color: o.wrongPrice ? "#d94040" : "inherit", minWidth: 80 }} >
                        {editingCell?.id === o.id && editingCell?.field === "price" ? (
                          <input
                            autoFocus
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={handleEditSave}
                            onKeyDown={handleKeyDown}
                            style={{ ...inlineInputStyle, borderColor: o.wrongPrice ? "#d94040" : "var(--color-accent)" }}
                          />
                        ) : (
                          <span
                            onClick={() => handleEditClick(o.id, "price", o.price)}
                            title={o.wrongPrice ? "⚠️ Цена не совпадает с расчетной! Нажмите для ред." : "Нажмите, чтобы изменить"}
                            style={{ borderBottom: o.wrongPrice ? "1px dashed #d94040" : "1px dashed var(--color-text-3)", cursor: "pointer", display: "inline-block", minHeight: 20 }}
                          >
                            {o.wrongPrice && "⚠️ "}{o.price ? `${o.price} ₽` : "—"}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "10px 14px", fontSize: 11 }}>{o.changedAt ? fmt(o.changedAt) : "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <Link href={`/dashboard?orderId=${o.id}`} style={openBtnStyle}>📍 Открыть</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ПАНЕЛЬ МАССОВЫХ ДЕЙСТВИЙ */}
      {selectedIds.size > 0 && (
        <div style={floatingPanelStyle}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Выбрано: {selectedIds.size}</div>
          <div style={{ width: 1, height: 24, background: "#404040" }} />
          <button
            onClick={handleMassUpdateCost}
            disabled={massUpdating}
            style={{ ...actionBtnStyle, background: massUpdating ? "#404040" : "var(--color-accent)", cursor: massUpdating ? "wait" : "pointer" }}
          >
            {massUpdating ? "⚡ Обработка..." : "🪄 Рассчитать себестоимость"}
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", color: "var(--color-text-3)", fontSize: 12, cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// Стили
const syncBtn = { padding: "6px 14px", color: "var(--color-contrast-fg)", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" };
const inputStyle = { padding: "7px 10px", borderRadius: 7, border: "1px solid #e0dfd7", fontSize: 12, outline: "none", color: "var(--color-text)", background: "var(--color-card)", maxWidth: 160 };
const inlineInputStyle = { width: "100%", padding: "4px 6px", borderRadius: 4, border: "1px solid var(--color-accent)", outline: "none", fontWeight: 600, fontSize: 12 };
const thStyle = { padding: "10px 14px", textAlign: "left" as const, fontSize: 10, fontWeight: 700, color: "var(--color-text-3)", textTransform: "uppercase" as const, letterSpacing: ".4px", whiteSpace: "nowrap" as const };
const openBtnStyle = { color: "var(--color-text)", textDecoration: "none", fontSize: 11, fontWeight: 600, background: "var(--color-bg)", border: "1px solid var(--color-border)", padding: "4px 8px", borderRadius: 6, whiteSpace: "nowrap" as const };
const calcBtnStyle = (disabled: boolean) => ({ padding: "4px 8px", fontSize: 10, borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--color-card)", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, color: disabled ? "var(--color-text-3)" : "var(--color-text)" });
const floatingPanelStyle = { position: "fixed" as const, bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--color-contrast-bg)", padding: "12px 24px", borderRadius: 12, display: "flex", alignItems: "center", gap: 20, zIndex: 100, color: "var(--color-contrast-fg)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" };
const actionBtnStyle = { color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600 };