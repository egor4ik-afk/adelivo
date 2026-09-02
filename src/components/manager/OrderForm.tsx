// src/components/manager/OrderForm.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressSuggest } from "@/components/AddressSuggest";

type Courier = { id: number; fullName: string; isActive?: boolean };

export type OrderFormValues = {
  externalId: string;
  address: string;
  deliveryDate: string;
  slotFrom: string;
  slotTo: string;
  name: string;
  recipientPhone: string;
  customerName: string;
  customerPhone: string;
  items: string;
  comment: string;
  opComment: string;
  price: string;
  shopId: string;
  status: string;
  courierId: string;
};

const EMPTY: OrderFormValues = {
  externalId: "", address: "", deliveryDate: "", slotFrom: "", slotTo: "",
  name: "", recipientPhone: "", customerName: "", customerPhone: "",
  items: "", comment: "", opComment: "", price: "", shopId: "", status: "NEW", courierId: "",
};

const STATUSES = [
  { v: "NEW", l: "Новый" },
  { v: "ASSEMBLING", l: "В сборке" },
  { v: "ASSIGNED", l: "Назначен" },
  { v: "IN_DELIVERY", l: "В пути" },
  { v: "DELIVERED", l: "Доставлен" },
  { v: "RETURNED", l: "Возврат" },
  { v: "CANCELLED", l: "Отменён" },
];

/* ── мелкие примитивы в стиле кабинета ─────────────────────── */
const label = "block text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-2)] mb-1.5";
const input =
  "w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[13px] text-[var(--color-text)] " +
  "outline-none transition-colors focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-3)]";
const card = "bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 shadow-sm";

function Field({
  id, title, children, hint, wide,
}: { id: string; title: string; children: React.ReactNode; hint?: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={id} className={label}>{title}</label>
      {children}
      {hint && <p className="text-[10px] text-[var(--color-text-3)] mt-1">{hint}</p>}
    </div>
  );
}

export function OrderForm({
  mode,
  orderId,
  initial,
}: {
  mode: "create" | "edit";
  orderId?: string;
  initial?: Partial<OrderFormValues>;
}) {
  const router = useRouter();
  const [v, setV] = useState<OrderFormValues>({ ...EMPTY, ...initial });
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);

  const set = (k: keyof OrderFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.shops ?? [];
        setShops(list);
        // Магазин один — выбирать не из чего, подставляем сразу
        if (list.length === 1) setV((p) => (p.shopId ? p : { ...p, shopId: list[0].id }));
      })
      .catch(() => setShops([]));

    fetch("/api/couriers")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCouriers(Array.isArray(d) ? d : d?.couriers ?? []))
      .catch(() => setCouriers([]));
  }, []);

  const parse = async () => {
    if (pasteText.trim().length < 10) return;
    setParsing(true);
    setParseNote(null);
    try {
      const res = await fetch("/api/orders/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось разобрать");

      // Заполняем только пустые поля: если оператор уже что-то ввёл руками,
      // разбор не должен это затирать
      setV((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(d.parsed ?? {})) {
          if (value === null || value === undefined || value === "") continue;
          const k = key as keyof OrderFormValues;
          if (!next[k]) next[k] = String(value);
        }
        return next;
      });

      const filled = Object.values(d.parsed ?? {}).filter(Boolean).length;
      setParseNote(
        d.warning
          ? `${d.warning}. Заполнено полей: ${filled}`
          : `Разобрано полей: ${filled}. Проверьте адрес и телефоны.`
      );
    } catch (e) {
      setParseNote(e instanceof Error ? e.message : "Не удалось разобрать");
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!v.address.trim()) { setError("Укажите адрес доставки"); return; }
    // Без магазина заказ не увидит никто: доступ считается по нему
    if (!v.shopId) { setError("Выберите магазин — от него зависит, кто увидит заказ"); return; }

    setSaving(true);
    try {
      const url = mode === "create" ? "/api/manager/orders" : `/api/manager/orders/${orderId}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, price: v.price === "" ? null : v.price }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка сохранения");
      router.push("/manager");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Шапка */}
      <header className="bg-[var(--color-card)] shadow-sm border-b border-[var(--color-border)] px-4 sm:px-6 py-4 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-2)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)] transition-colors shrink-0"
            title="Назад"
            aria-label="Назад"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)] tracking-tight truncate">
            {mode === "create" ? "Новый заказ" : `Заказ ${v.externalId || ""}`}
          </h1>
        </div>
        <button
          onClick={submit}
          disabled={saving}
          className={`px-4 sm:px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-all ${
            saving ? "bg-[var(--color-border)] text-[var(--color-text-3)] cursor-not-allowed" : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]"
          }`}
        >
          {saving ? "Сохраняем…" : mode === "create" ? "Создать заказ" : "Сохранить"}
        </button>
      </header>

      <main className="max-w-[900px] mx-auto p-3 sm:p-6 flex flex-col gap-4 sm:gap-5">
        {error && (
          <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] px-4 py-3 text-[13px] font-medium">
            {error}
          </div>
        )}

        {/* Вставка текста заявки */}
        {mode === "create" && (
          <section className={card}>
            <h2 className="text-[13px] font-bold text-[var(--color-text)] mb-1">Вставить заявку текстом</h2>
            <p className="text-[11px] text-[var(--color-text-3)] mb-3 leading-relaxed">
              Скопируйте сообщение из чата целиком — адрес, телефон, время и состав
              разложатся по полям. Проверьте результат перед сохранением.
            </p>
            <textarea
              rows={4}
              className={input}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"Заказ 8821\nМосква, Ленина 42, кв 7, домофон 7К\nАнна +7 999 000-00-00\nзавтра с 14 до 18\nБукет «Весна», открытка\n4500 руб"}
            />
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <button
                type="button"
                onClick={parse}
                disabled={parsing || pasteText.trim().length < 10}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  parsing || pasteText.trim().length < 10
                    ? "bg-[var(--color-border)] text-[var(--color-text-3)] cursor-not-allowed"
                    : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]"
                }`}
              >
                {parsing ? "Разбираем…" : "Разобрать текст"}
              </button>
              {pasteText && (
                <button
                  type="button"
                  onClick={() => { setPasteText(""); setParseNote(null); }}
                  className="text-[12px] text-[var(--color-text-3)] hover:text-[var(--color-text)]"
                >
                  Очистить
                </button>
              )}
              {parseNote && (
                <span className="text-[11px] text-[var(--color-text-2)]">{parseNote}</span>
              )}
            </div>
          </section>
        )}

        {/* Доставка */}
        <section className={card}>
          <h2 className="text-[13px] font-bold text-[var(--color-text)] mb-3">Доставка</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Field id="address" title="Адрес *" wide hint="После сохранения адрес автоматически геокодируется и попадёт в маршрут">
              <AddressSuggest
                className={input}
                value={v.address}
                onChange={(val) => setV((p) => ({ ...p, address: val }))}
                invalid={!v.address.trim()}
                placeholder="Москва, ул. Ленина, 42, кв. 7"
              />
            </Field>
            <Field id="deliveryDate" title="Дата доставки">
              <input id="deliveryDate" type="date" className={input} value={v.deliveryDate} onChange={set("deliveryDate")} />
            </Field>
            <Field id="status" title="Статус">
              <select id="status" className={input} value={v.status} onChange={set("status")}>
                {STATUSES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
              </select>
            </Field>
            <Field id="slotFrom" title="Слот с">
              <input id="slotFrom" type="time" className={input} value={v.slotFrom} onChange={set("slotFrom")} />
            </Field>
            <Field id="slotTo" title="Слот до">
              <input id="slotTo" type="time" className={input} value={v.slotTo} onChange={set("slotTo")} />
            </Field>
            <Field id="courierId" title="Курьер">
              <select id="courierId" className={input} value={v.courierId} onChange={set("courierId")}>
                <option value="">— не назначен —</option>
                {couriers.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </Field>
            <Field id="price" title="Сумма заказа, ₽">
              <input id="price" type="number" inputMode="numeric" className={input} value={v.price} onChange={set("price")} placeholder="0" />
            </Field>
          </div>
        </section>

        {/* Люди */}
        <section className={card}>
          <h2 className="text-[13px] font-bold text-[var(--color-text)] mb-3">Заказчик и получатель</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <Field id="customerName" title="Заказчик">
              <input id="customerName" className={input} value={v.customerName} onChange={set("customerName")} placeholder="Имя" />
            </Field>
            <Field id="customerPhone" title="Телефон заказчика">
              <input id="customerPhone" className={input} value={v.customerPhone} onChange={set("customerPhone")} placeholder="+7 999 000-00-00" />
            </Field>
            <Field id="name" title="Получатель">
              <input id="name" className={input} value={v.name} onChange={set("name")} placeholder="Имя" />
            </Field>
            <Field id="recipientPhone" title="Телефон получателя">
              <input id="recipientPhone" className={input} value={v.recipientPhone} onChange={set("recipientPhone")} placeholder="+7 999 000-00-00" />
            </Field>
          </div>
        </section>

        {/* Состав и комментарии */}
        <section className={card}>
          <h2 className="text-[13px] font-bold text-[var(--color-text)] mb-3">Состав и комментарии</h2>
          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            <Field id="items" title="Состав заказа">
              <textarea id="items" rows={2} className={input} value={v.items} onChange={set("items")} placeholder="Букет «Весна» × 1, открытка" />
            </Field>
            <Field id="comment" title="Комментарий заказчика">
              <textarea id="comment" rows={2} className={input} value={v.comment} onChange={set("comment")} placeholder="Домофон 7К, позвонить за 15 минут" />
            </Field>
            <Field id="opComment" title="Комментарий оператора" hint="Виден курьеру, в CRM не уходит">
              <textarea id="opComment" rows={2} className={input} value={v.opComment} onChange={set("opComment")} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <Field id="externalId" title="Номер заказа" hint={mode === "create" ? "Оставьте пустым — сгенерируем автоматически" : "Изменить нельзя"}>
                <input id="externalId" className={input} value={v.externalId} onChange={set("externalId")} disabled={mode === "edit"} placeholder="8821" />
              </Field>
              <Field
                id="shopId"
                title="Магазин *"
                hint={shops.length === 0 ? "Магазинов нет — создайте его в разделе «Компания»" : "От магазина зависит, кто увидит заказ"}
              >
                <select
                  id="shopId"
                  className={`${input} ${!v.shopId ? "border-[var(--color-amber)]" : ""}`}
                  value={v.shopId}
                  onChange={set("shopId")}
                >
                  <option value="">— выберите —</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>

        <div className="flex gap-3 pb-10">
          <button
            onClick={submit}
            disabled={saving}
            className={`flex-1 py-3 rounded-xl text-sm font-bold shadow-sm transition-all ${
              saving ? "bg-[var(--color-border)] text-[var(--color-text-3)] cursor-not-allowed" : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-dark)]"
            }`}
          >
            {saving ? "Сохраняем…" : mode === "create" ? "Создать заказ" : "Сохранить изменения"}
          </button>
          <button
            onClick={() => router.back()}
            className="px-5 py-3 rounded-xl text-sm font-bold border border-[var(--color-border)] text-[var(--color-text-2)] hover:text-[var(--color-text)] transition-colors"
          >
            Отмена
          </button>
        </div>
      </main>
    </div>
  );
}
