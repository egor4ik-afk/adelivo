// src/components/company/CompanyClient.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CONNECTORS, type ConnectorType } from "@/lib/connectors";

type Shop = {
  id: string; slug: string; name: string; isActive: boolean;
  connectorType: string | null; storeAddress: string | null; ordersCount: number;
  connector: {
    type: string; isActive: boolean; baseUrl: string | null;
    hasKey: boolean; lastSyncAt: string | null; lastError: string | null;
  } | null;
};
type Company = {
  id: string; slug: string; name: string;
  phone: string | null; email: string | null;
  inviteEnabled: boolean; inviteToken: string; usersCount: number;
};

const input =
  "w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] " +
  "text-[13px] text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] " +
  "placeholder:text-[var(--color-text-3)]";
const card = "bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 shadow-sm";
const label = "block text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-2)] mb-1.5";
const btnPri =
  "px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-bold shadow-sm " +
  "hover:bg-[var(--color-accent-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnGhost =
  "px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-2)] text-sm font-bold " +
  "hover:border-[var(--color-accent)] hover:text-[var(--color-text)] transition-colors";

export function CompanyClient({ siteUrl }: { siteUrl: string }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // создание компании
  const [newCompany, setNewCompany] = useState({ name: "", slug: "", phone: "" });
  // создание магазина
  const [newShop, setNewShop] = useState({ name: "", connectorType: "RETAILCRM" as ConnectorType });
  const [addingShop, setAddingShop] = useState(false);
  // настройка подключения
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ connectorType: "RETAILCRM" as ConnectorType, baseUrl: "", apiKey: "" });
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company");
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Ошибка загрузки");
      setCompany(d.company);
      setShops(d.shops ?? []);
      setIsAdmin(!!d.isAdmin);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const createCompany = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCompany),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось создать");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать");
    } finally { setBusy(false); }
  };

  const createShop = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/company/shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newShop),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось создать магазин");
      setAddingShop(false);
      setNewShop({ name: "", connectorType: "RETAILCRM" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать магазин");
    } finally { setBusy(false); }
  };

  const openEditor = (s: Shop) => {
    setEditing(s.id);
    setTestResult(null);
    setForm({
      connectorType: (s.connector?.type ?? s.connectorType ?? "RETAILCRM") as ConnectorType,
      baseUrl: s.connector?.baseUrl ?? "",
      apiKey: "",
    });
  };

  const testConn = async (shopId: string) => {
    setBusy(true); setTestResult(null);
    try {
      const res = await fetch("/api/company/shops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, test: true, ...form }),
      });
      const d = await res.json();
      setTestResult({ ok: !!d.ok, message: d.message || d.error || "Нет ответа" });
    } catch {
      setTestResult({ ok: false, message: "Не удалось выполнить проверку" });
    } finally { setBusy(false); }
  };

  const saveConn = async (shopId: string) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/company/shops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, ...form }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось сохранить");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally { setBusy(false); }
  };

  const toggleActive = async (s: Shop) => {
    setBusy(true);
    try {
      await fetch("/api/company/shops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: s.id, isActive: !s.connector?.isActive }),
      });
      await load();
    } finally { setBusy(false); }
  };

  const inviteUrl = company ? `${siteUrl}/join/${company.slug}?t=${company.inviteToken}` : "";
  const copyInvite = () => {
    navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <p className="text-center text-[var(--color-text-3)] py-12 animate-pulse">Загрузка…</p>;
  }

  // ─── Компании ещё нет ───
  if (!company) {
    return (
      <div className="max-w-[560px] mx-auto flex flex-col gap-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-[13px] font-medium">{error}</div>}
        <div className={card}>
          <h2 className="text-[15px] font-bold text-[var(--color-text)] mb-1">Создание компании</h2>
          <p className="text-[12px] text-[var(--color-text-3)] mb-4 leading-relaxed">
            Компания — это владелец магазинов. После создания вы получите ссылку-приглашение:
            все, кто зарегистрируется по ней, станут сотрудниками вашей компании.
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label className={label} htmlFor="cname">Название</label>
              <input id="cname" className={input} value={newCompany.name}
                onChange={(e) => setNewCompany((p) => ({ ...p, name: e.target.value }))}
                placeholder="Цветочная лавка" />
            </div>
            <div>
              <label className={label} htmlFor="cslug">Адрес</label>
              <div className="flex items-center gap-1">
                <span className="text-[13px] text-[var(--color-text-3)] shrink-0">{siteUrl.replace(/^https?:\/\//, "")}/</span>
                <input id="cslug" className={input} value={newCompany.slug}
                  onChange={(e) => setNewCompany((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="magaz" />
              </div>
              <p className="text-[10px] text-[var(--color-text-3)] mt-1">
                Оставьте пустым — составим из названия. Латиница, цифры и дефис.
              </p>
            </div>
            <div>
              <label className={label} htmlFor="cphone">Телефон</label>
              <input id="cphone" className={input} value={newCompany.phone}
                onChange={(e) => setNewCompany((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+7 999 000-00-00" />
            </div>
            <button onClick={createCompany} disabled={busy || newCompany.name.trim().length < 2} className={btnPri}>
              {busy ? "Создаём…" : "Создать компанию"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Компания есть ───
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-[13px] font-medium">{error}</div>}

      {/* Профиль компании */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-[var(--color-text)]">{company.name}</h2>
            <p className="text-[12px] text-[var(--color-text-3)] mt-0.5">
              {company.usersCount} сотрудник(ов) · {shops.length} магазин(ов)
            </p>
          </div>
          <Link href="/manager/orders/new" className={btnPri}>+ Создать заказ</Link>
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <label className={label}>Ссылка для сотрудников</label>
          <div className="flex flex-wrap gap-2 items-center">
            <code className="flex-1 min-w-[240px] px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[12px] text-[var(--color-text-2)] overflow-x-auto whitespace-nowrap">
              {inviteUrl}
            </code>
            <button onClick={copyInvite} className={btnGhost}>{copied ? "Скопировано" : "Копировать"}</button>
          </div>
          <p className="text-[11px] text-[var(--color-text-3)] mt-2 leading-relaxed">
            Кто зарегистрируется по этой ссылке — попадёт в вашу компанию. Роль по умолчанию — курьер,
            поменять можно в <Link href="/admin" className="text-[var(--color-accent-fg)]">управлении доступом</Link>.
          </p>
        </div>
      </section>

      {/* Магазины */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-[15px] font-bold text-[var(--color-text)]">Магазины и подключения</h2>
          {isAdmin && !addingShop && (
            <button onClick={() => setAddingShop(true)} className={btnGhost}>+ Магазин</button>
          )}
        </div>

        {addingShop && (
          <div className="mb-4 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col gap-3">
            <div>
              <label className={label} htmlFor="sname">Название магазина</label>
              <input id="sname" className={input} value={newShop.name}
                onChange={(e) => setNewShop((p) => ({ ...p, name: e.target.value }))}
                placeholder="Основной склад" />
            </div>
            <div>
              <label className={label} htmlFor="stype">Откуда приходят заказы</label>
              <select id="stype" className={input} value={newShop.connectorType}
                onChange={(e) => setNewShop((p) => ({ ...p, connectorType: e.target.value as ConnectorType }))}>
                {(Object.keys(CONNECTORS) as ConnectorType[]).map((k) => (
                  <option key={k} value={k}>{CONNECTORS[k].label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={createShop} disabled={busy || newShop.name.trim().length < 2} className={btnPri}>Создать</button>
              <button onClick={() => setAddingShop(false)} className={btnGhost}>Отмена</button>
            </div>
          </div>
        )}

        {shops.length === 0 && !addingShop && (
          <p className="text-[13px] text-[var(--color-text-3)] py-6 text-center">
            Магазинов пока нет. Добавьте первый — и подключите к нему свою систему.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {shops.map((s) => {
            const conf = CONNECTORS[(s.connector?.type ?? "WEBHOOK") as ConnectorType];
            const isOpen = editing === s.id;
            return (
              <div key={s.id} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-bold text-[14px] text-[var(--color-text)]">{s.name}</div>
                    <div className="text-[11px] text-[var(--color-text-3)] mt-0.5">
                      {s.slug} · {conf?.label ?? "не настроено"} · заказов: {s.ordersCount}
                    </div>
                    {s.connector?.lastError && (
                      <div className="text-[11px] text-red-600 mt-1">Ошибка: {s.connector.lastError}</div>
                    )}
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${
                    s.connector?.isActive
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-700"
                  }`}>
                    {s.connector?.isActive ? "активен" : "выключен"}
                  </span>

                  {isAdmin && (
                    <div className="flex gap-2">
                      <button onClick={() => (isOpen ? setEditing(null) : openEditor(s))} className={btnGhost}>
                        {isOpen ? "Свернуть" : "Настроить"}
                      </button>
                      {s.connector?.hasKey && (
                        <button onClick={() => toggleActive(s)} disabled={busy} className={btnGhost}>
                          {s.connector.isActive ? "Выключить" : "Включить"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="p-3 sm:p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col gap-3">
                    <div>
                      <label className={label}>Система</label>
                      <select className={input} value={form.connectorType}
                        onChange={(e) => { setForm((p) => ({ ...p, connectorType: e.target.value as ConnectorType })); setTestResult(null); }}>
                        {(Object.keys(CONNECTORS) as ConnectorType[]).map((k) => (
                          <option key={k} value={k}>{CONNECTORS[k].label}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[var(--color-text-3)] mt-1.5 leading-relaxed">
                        {CONNECTORS[form.connectorType].hint}
                      </p>
                    </div>

                    {form.connectorType !== "WEBHOOK" && (
                      <>
                        <div>
                          <label className={label}>{CONNECTORS[form.connectorType].urlLabel}</label>
                          <input className={input} value={form.baseUrl}
                            onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))}
                            placeholder={CONNECTORS[form.connectorType].urlPlaceholder} />
                        </div>
                        {form.connectorType !== "BITRIX24" && (
                          <div>
                            <label className={label}>{CONNECTORS[form.connectorType].keyLabel}</label>
                            <input className={input} type="password" value={form.apiKey}
                              onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                              placeholder={s.connector?.hasKey ? "оставьте пустым, чтобы не менять" : CONNECTORS[form.connectorType].keyPlaceholder} />
                          </div>
                        )}
                      </>
                    )}

                    {testResult && (
                      <div className={`rounded-lg px-3 py-2.5 text-[12px] font-medium border ${
                        testResult.ok
                          ? "bg-green-50 border-green-200 text-green-800"
                          : "bg-red-50 border-red-200 text-red-700"
                      }`}>
                        {testResult.message}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => testConn(s.id)} disabled={busy} className={btnGhost}>
                        {busy ? "Проверяем…" : "Проверить подключение"}
                      </button>
                      <button onClick={() => saveConn(s.id)} disabled={busy} className={btnPri}>Сохранить</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[12px] text-[var(--color-text-3)] leading-relaxed">
        Проверка подключения только читает данные — она делает один запрос и ничего не меняет
        в вашей системе. Заказы начнут забираться после включения коннектора.
      </p>
    </div>
  );
}
