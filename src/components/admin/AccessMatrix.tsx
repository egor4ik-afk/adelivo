// src/components/admin/AccessMatrix.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type User = {
  id: string; email: string; role: string;
  firstName: string | null; lastName: string | null;
  isSuperAdmin: boolean; accessRestricted?: boolean;
  companyId: string | null; lastLoginAt: string | null;
};
type Shop = { id: string; slug: string; name: string; isActive: boolean };
type Access = { userId: string; shopId: string; canEdit: boolean };
type Courier = { id: number; email: string | null; fullName: string; isApproved: boolean; isActive: boolean };

const ROLES: Record<string, { label: string; cls: string }> = {
  ADMIN: { label: "Админ", cls: "bg-purple-100 text-purple-800" },
  OPERATOR: { label: "Оператор", cls: "bg-blue-100 text-blue-800" },
  COURIER: { label: "Курьер", cls: "bg-green-100 text-green-800" },
};

export function AccessMatrix() {
  const [users, setUsers] = useState<User[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [access, setAccess] = useState<Access[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/access");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ошибка загрузки");
      setUsers(data.users);
      setShops(data.shops);
      setAccess(data.access);
      setCouriers(data.couriers ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Профиль курьера ищется по email — так же, как во всём остальном коде
  const courierOf = useMemo(() => {
    const byEmail = new Map(
      couriers.filter(c => c.email).map(c => [c.email!.toLowerCase(), c])
    );
    return (email: string) => byEmail.get(email.toLowerCase()) ?? null;
  }, [couriers]);

  const has = useMemo(() => {
    const s = new Set(access.map((a) => `${a.userId}:${a.shopId}`));
    return (u: string, sh: string) => s.has(`${u}:${sh}`);
  }, [access]);

  const patch = async (body: Record<string, unknown>, key: string) => {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/access", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Не удалось сохранить");
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
      return false;
    } finally {
      setSaving(null);
    }
  };

  const toggleShop = async (userId: string, shopId: string) => {
    const checked = !has(userId, shopId);
    setAccess((p) =>
      checked
        ? [...p, { userId, shopId, canEdit: true }]
        : p.filter((a) => !(a.userId === userId && a.shopId === shopId))
    );
    const ok = await patch({ userId, shopId, checked }, `${userId}:${shopId}`);
    if (!ok) load();
  };

  const toggleWork = async (u: User) => {
    const c = courierOf(u.email);
    if (!c) return;
    const next = !c.isApproved;
    setCouriers((p) => p.map((x) => (x.id === c.id ? { ...x, isApproved: next } : x)));
    const ok = await patch({ userId: u.id, courierApproved: next }, `w:${u.id}`);
    if (!ok) load();
  };

  const toggleSuper = async (u: User) => {
    const next = !u.isSuperAdmin;
    const ok = await patch({ userId: u.id, isSuperAdmin: next }, `s:${u.id}`);
    if (ok) setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, isSuperAdmin: next } : x)));
  };

  const shown = users.filter((u) => {
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    if (!q.trim()) return true;
    const s = `${u.email} ${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
    return s.includes(q.toLowerCase().trim());
  });

  const name = (u: User) =>
    [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email.split("@")[0];

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-[13px] font-medium">
          {error}
        </div>
      )}

      {/* Фильтры */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени или почте"
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] min-w-[220px]"
        />
        <div className="flex bg-[var(--color-border)] p-1 rounded-xl gap-1">
          {["ALL", "ADMIN", "OPERATOR", "COURIER"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                roleFilter === r
                  ? "bg-[var(--color-card)] shadow-sm text-[var(--color-text)]"
                  : "text-[var(--color-text-2)] hover:text-[var(--color-text)]"
              }`}
            >
              {r === "ALL" ? "Все" : ROLES[r]?.label ?? r}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-[var(--color-text-3)] ml-auto">
          {shown.length} из {users.length}
        </span>
      </div>

      {loading ? (
        <p className="text-center text-[var(--color-text-3)] py-10 animate-pulse">Загрузка матрицы…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-[var(--color-surface)]">
                <th className="text-left px-4 py-3 font-bold text-[var(--color-text)] sticky left-0 bg-[var(--color-surface)] z-10 min-w-[220px]">
                  Сотрудник
                </th>
                <th className="px-3 py-3 font-bold text-[var(--color-text)] whitespace-nowrap">Работа</th>
                {shops.map((s) => (
                  <th key={s.id} className="px-3 py-3 font-bold text-[var(--color-text)] whitespace-nowrap text-center">
                    {s.name}
                    <div className="text-[10px] font-normal text-[var(--color-text-3)]">{s.slug}</div>
                  </th>
                ))}
                <th className="px-3 py-3 font-bold text-[var(--color-text)] whitespace-nowrap">Глоб. админ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const roleConf = ROLES[u.role] ?? { label: u.role, cls: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={u.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface)]">
                    <td className="px-4 py-3 sticky left-0 bg-[var(--color-card)] z-10">
                      <div className="font-semibold text-[var(--color-text)]">{name(u)}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${roleConf.cls}`}>
                          {roleConf.label}
                        </span>
                        <span className="text-[11px] text-[var(--color-text-3)] truncate max-w-[160px]">{u.email}</span>
                      </div>
                    </td>

                    {/* Допуск курьера к работе */}
                    <td className="px-3 py-3 text-center">
                      {u.role === "COURIER" ? (
                        (() => {
                          const c = courierOf(u.email);
                          if (!c) {
                            return (
                              <span className="text-[10px] text-[var(--color-text-3)]" title="Профиль появится после первого входа курьера">
                                нет профиля
                              </span>
                            );
                          }
                          return (
                            <input
                              type="checkbox"
                              checked={c.isApproved}
                              disabled={saving === `w:${u.id}`}
                              onChange={() => toggleWork(u)}
                              title={c.isApproved ? "Допущен к работе" : "Не допущен: заказы не приходят"}
                              className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                            />
                          );
                        })()
                      ) : (
                        <span className="text-[10px] text-[var(--color-text-3)]">—</span>
                      )}
                    </td>

                    {/* Галочки по магазинам */}
                    {shops.map((s) => (
                      <td key={s.id} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          // Галочка — ровно строка в ShopAccess.
                          // Блокируем только у глобального админа: он вне матрицы.
                          checked={u.isSuperAdmin ? true : has(u.id, s.id)}
                          disabled={u.isSuperAdmin || saving === `${u.id}:${s.id}`}
                          onChange={() => toggleShop(u.id, s.id)}
                          title={
                            u.isSuperAdmin
                              ? "Глобальный админ видит все магазины"
                              : has(u.id, s.id)
                              ? `Снять доступ к «${s.name}»`
                              : `Дать доступ к «${s.name}»`
                          }
                          className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </td>
                    ))}

                    {/* Глобальный админ */}
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={u.isSuperAdmin}
                        disabled={saving === `s:${u.id}`}
                        onChange={() => toggleSuper(u)}
                        className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                      />
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={shops.length + 3} className="px-4 py-10 text-center text-[var(--color-text-3)]">
                    Никого не нашлось
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[12px] text-[var(--color-text-3)] leading-relaxed">
Доступ определяется этой матрицей и только ей: отмеченные магазины — это
        всё, что человек видит в заказах, маршрутах, курьерах и чате. Компания,
        по чьей ссылке он зарегистрировался, на видимость не влияет — она нужна
        только для того, чтобы понимать, кто кем управляет.
      </p>
    </div>
  );
}