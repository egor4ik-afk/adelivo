// src/app/login/page.tsx
"use client";
import { useState, useEffect } from "react";
import { IMaskInput } from "react-imask";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [isOperator, setIsOperator] = useState(false);
  const [secretCode, setSecretCode] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  // ── Ключевой фикс: /login никогда не должен оставаться в стеке истории.
  // replaceState заменяет текущую запись, а не добавляет новую.
  // Это значит что кнопка «Назад» с /login уйдёт туда куда пришла ДО /login,
  // а не будет гонять пользователя в цикле login → dashboard → login.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Заменяем текущую запись в истории на /login — без добавления новой.
    // Теперь нажатие «Назад» уйдёт ВЫШЕ /login в стеке, а не останется на ней.
    window.history.replaceState(null, "", "/login");

    // Если пользователь уже авторизован — убираем со страницы логина сразу.
    // Это предотвращает мигание формы для залогиненных.
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.role === "COURIER") window.location.replace("/courier/profile");
        else if (d?.role) window.location.replace("/dashboard");
      })
      .catch(() => {/* не залогинен — ок */});
  }, []);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();

    if (isOperator && secretCode !== "0007") {
      setError("Неверный секретный пароль оператора!");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, isOperator, secretCode: isOperator ? secretCode : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.role === "COURIER" && !data.linked) {
        setStep(3);
        return;
      }

      // replace — не push. Логин не остаётся в истории после успешного входа.
      if (data.role === "COURIER") window.location.replace("/courier/profile");
      else window.location.replace("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkCourier(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("Пожалуйста, введите Имя и Фамилию");
      return;
    }

    setLoading(true);
    setError("");
    const cleanPhone = phone.replace(/[^\d+]/g, "");

    try {
      const res = await fetch("/api/auth/link-courier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone: cleanPhone }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Ошибка создания/привязки профиля");
      }
      window.location.replace("/courier/profile");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoWrap}>
          <img src="/favicon.svg" alt="Logo" style={{ width: 32, height: 32 }} />
          <h1 style={s.logoText}>EventWave</h1>
        </div>

        {error && <div style={s.err}>{error}</div>}

        {step === 1 && (
          <form onSubmit={handleSendCode} style={{ display: "flex", flexDirection: "column" }}>
            <label style={s.label}>Email</label>
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ivan@example.com"
              style={s.input}
            />

            <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textTransform: "none", color: "#6b6860", fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              <input
                type="checkbox" checked={isOperator}
                onChange={(e) => setIsOperator(e.target.checked)}
                style={{ accentColor: "#4a7aff", width: 16, height: 16 }}
              />
              Войти как оператор
            </label>

            {isOperator && (
              <>
                <label style={s.label}>Секретный код</label>
                <input
                  type="password" value={secretCode}
                  onChange={(e) => setSecretCode(e.target.value)}
                  placeholder="0000"
                  style={s.input}
                />
              </>
            )}

            <button disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Отправка..." : "Получить код"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column" }}>
            <div style={s.sub}>Код отправлен на <b>{email}</b></div>
            <label style={s.label}>Код из письма</label>
            <input
              type="text" required value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              style={{ ...s.input, fontSize: 20, letterSpacing: 4, textAlign: "center", fontWeight: 600 }}
            />
            <button disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Проверка..." : "Войти"}
            </button>
            <button type="button" onClick={() => setStep(1)} style={s.back}>
              Изменить email
            </button>
          </form>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={s.sub}>
              <div style={{ fontSize: 14, color: "#1a1a18", fontWeight: 600, marginBottom: 4 }}>Добро пожаловать!</div>
              Заполните данные профиля для начала работы.
            </div>

            <form onSubmit={handleLinkCourier} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={s.label}>Имя</label>
                <input
                  type="text" required value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Иван"
                  style={{ ...s.input, marginBottom: 0 }}
                />
              </div>
              <div>
                <label style={s.label}>Фамилия</label>
                <input
                  type="text" required value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Иванов"
                  style={{ ...s.input, marginBottom: 0 }}
                />
              </div>
              <div>
                <label style={s.label}>Ваш номер телефона</label>
                <IMaskInput
                  mask="+7 (000) 000-00-00"
                  value={phone}
                  onAccept={(val: string) => setPhone(val)}
                  placeholder="+7 (___) ___-__-__"
                  style={{ ...s.input, marginBottom: 0 }}
                />
              </div>

              <button
                disabled={loading || phone.length < 18 || !firstName || !lastName}
                style={{ ...s.btn, marginTop: 8, opacity: phone.length >= 18 && firstName && lastName && !loading ? 1 : 0.5 }}
              >
                {loading ? "Сохранение..." : "Начать работу →"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f4f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    background: "#fff",
    borderRadius: 20,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 380,
    boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
  },
  logoWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
    color: "#1a1a18",
    letterSpacing: "-0.02em",
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#a8a49c",
    marginBottom: 6,
  },
  input: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1.5px solid #e8e6df",
    fontSize: 15,
    color: "#1a1a18",
    background: "#fafaf8",
    marginBottom: 16,
    outline: "none",
    width: "100%",
    fontFamily: "inherit",
  },
  btn: {
    padding: "13px 0",
    borderRadius: 10,
    background: "#4a7aff",
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    border: "none",
    cursor: "pointer",
    marginTop: 4,
    width: "100%",
    fontFamily: "inherit",
  },
  back: {
    marginTop: 12,
    background: "none",
    border: "none",
    color: "#a8a49c",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "center" as const,
    fontFamily: "inherit",
  },
  sub: {
    fontSize: 13,
    color: "#6b6860",
    marginBottom: 20,
    lineHeight: 1.5,
  },
  err: {
    background: "#fef2f2",
    color: "#dc2626",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    marginBottom: 16,
    fontWeight: 500,
  },
};