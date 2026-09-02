// src/components/company/TelegramSources.tsx
"use client";

import { useEffect, useState } from "react";

type Shop = { id: string; name: string; slug: string };
type Source = {
  id: string; chatId: string; title: string | null;
  isActive: boolean; autoCreate: boolean; hintTemplate: string | null;
  lastMessageAt: string | null; lastError: string | null; ordersCreated: number;
  shop: { id: string; name: string; slug: string };
};

const input =
  "w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] " +
  "text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] " +
  "placeholder:text-[var(--color-text-3)]";
const label = "block text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-2)] mb-1.5";
const btnPri =
  "px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-bold " +
  "hover:bg-[var(--color-accent-dark)] transition-colors disabled:opacity-50";
const btnGhost =
  "px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-2)] text-sm font-bold " +
  "hover:border-[var(--color-accent)] hover:text-[var(--color-text)] transition-colors";

export function TelegramSources({ shops }: { shops: Shop[] }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ chatId: "", title: "", shopId: "", autoCreate: false, hintTemplate: "" });

  const load = async () => {
    try {
      const res = await fetch("/api/company/telegram");
      const d = await res.json();
      if (res.ok) setSources(d.sources ?? []);
    } catch { /* блок необязательный */ }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/company/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось подключить");
      setAdding(false);
      setForm({ chatId: "", title: "", shopId: "", autoCreate: false, hintTemplate: "" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось подключить");
    } finally { setBusy(false); }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch("/api/company/telegram", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      load();
    } finally { setBusy(false); }
  };

  const remove = async (s: Source) => {
    if (!confirm(`Отключить чат ${s.title || s.chatId}? Заказы из него перестанут создаваться.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/company/telegram?id=${s.id}`, { method: "DELETE" });
      load();
    } finally { setBusy(false); }
  };

  return (
    <section className="bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-[15px] font-bold text-[var(--color-text)]">Заказы из Telegram</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className={btnGhost} disabled={shops.length === 0}>
            + Подключить чат
          </button>
        )}
      </div>

      <p className="text-[12px] text-[var(--color-text-3)] mb-4 leading-relaxed">
        Добавьте нашего бота в чат с заявками и укажите здесь его ID — сообщения
        будут разбираться и превращаться в заказы. Чтобы узнать ID, отправьте
        в чат команду <code className="text-[var(--color-text-2)]">/id</code>: бот ответит числом.
      </p>

      {error && (
        <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] px-4 py-3 text-[13px] font-medium mb-3">
          {error}
        </div>
      )}

      {adding && (
        <div className="mb-4 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="chatId">ID чата *</label>
              <input id="chatId" className={input} value={form.chatId}
                onChange={(e) => setForm((p) => ({ ...p, chatId: e.target.value }))}
                placeholder="-1001234567890" />
            </div>
            <div>
              <label className={label} htmlFor="tgTitle">Название</label>
              <input id="tgTitle" className={input} value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Заявки — основной чат" />
            </div>
          </div>

          <div>
            <label className={label} htmlFor="tgShop">Магазин *</label>
            <select id="tgShop" className={input} value={form.shopId}
              onChange={(e) => setForm((p) => ({ ...p, shopId: e.target.value }))}>
              <option value="">— выберите —</option>
              {shops.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="tgHint">Подсказка разбору</label>
            <textarea id="tgHint" rows={3} className={input} value={form.hintTemplate}
              onChange={(e) => setForm((p) => ({ ...p, hintTemplate: e.target.value }))}
              placeholder={"Пример: номер заказа всегда первой строкой,\nтелефон получателя идёт после адреса,\nсумма в конце сообщения"} />
            <p className="text-[10px] text-[var(--color-text-3)] mt-1 leading-relaxed">
              Если в чате устоявшийся формат сообщений, опишите его — разбор будет точнее.
              Оставьте пустым для обычного разбора.
            </p>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-[var(--color-text-2)] cursor-pointer">
            <input type="checkbox" checked={form.autoCreate}
              onChange={(e) => setForm((p) => ({ ...p, autoCreate: e.target.checked }))}
              className="w-4 h-4 accent-[var(--color-accent)]" />
            Создавать заказы сразу, без проверки
          </label>
          <p className="text-[10px] text-[var(--color-text-3)] -mt-2 leading-relaxed">
            Пока выключено, заказ попадает в статус «В сборке» — диспетчер проверяет разбор
            и переводит дальше. Включайте, когда убедитесь, что формат чата разбирается верно.
          </p>

          <div className="flex gap-2">
            <button onClick={add} disabled={busy || !form.chatId || !form.shopId} className={btnPri}>
              {busy ? "Подключаем…" : "Подключить"}
            </button>
            <button onClick={() => { setAdding(false); setError(null); }} className={btnGhost}>Отмена</button>
          </div>
        </div>
      )}

      {sources.length === 0 && !adding && (
        <p className="text-[13px] text-[var(--color-text-3)] py-4 text-center">
          Чаты не подключены
        </p>
      )}

      <div className="flex flex-col gap-2">
        {sources.map((s) => (
          <div key={s.id} className="rounded-xl border border-[var(--color-border)] p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="font-bold text-[14px] text-[var(--color-text)]">
                {s.title || s.chatId}
              </div>
              <div className="text-[11px] text-[var(--color-text-3)] mt-0.5">
                {s.chatId} → {s.shop.name} · заказов: {s.ordersCreated}
                {s.lastMessageAt ? ` · последнее: ${new Date(s.lastMessageAt).toLocaleString("ru-RU")}` : ""}
              </div>
              {s.lastError && (
                <div className="text-[11px] text-[var(--color-red)] mt-1">Ошибка: {s.lastError}</div>
              )}
            </div>

            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${
              s.autoCreate ? "bg-teal-100 text-teal-800" : "bg-yellow-100 text-yellow-800"
            }`}>
              {s.autoCreate ? "авто" : "с проверкой"}
            </span>

            <div className="flex gap-2">
              <button onClick={() => patch(s.id, { isActive: !s.isActive })} disabled={busy} className={btnGhost}>
                {s.isActive ? "Выключить" : "Включить"}
              </button>
              <button onClick={() => patch(s.id, { autoCreate: !s.autoCreate })} disabled={busy} className={btnGhost}>
                {s.autoCreate ? "С проверкой" : "Авто"}
              </button>
              <button onClick={() => remove(s)} disabled={busy} className={btnGhost}>Удалить</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
