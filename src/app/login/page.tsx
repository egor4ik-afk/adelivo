// src/app/login/page.tsx
"use client";
import { useState } from "react";
import { IMaskInput } from "react-imask";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [isOperator, setIsOperator] = useState(false);
  const [secretCode, setSecretCode] = useState("");

  // Для Шага 3 (создание/привязка профиля курьера)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    
    // Проверяем пароль до отправки email-кода
    if (isOperator && secretCode !== "0007") {
      setError("Неверный секретный пароль оператора!");
      return;
    }

    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(2);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, isOperator, secretCode: isOperator ? secretCode : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Если курьер и у него еще нет привязанного профиля БД — переходим на шаг 3
      if (data.role === "COURIER" && !data.linked) {
        setStep(3);
        return;
      }

      if (data.role === "COURIER") window.location.replace("/courier/profile");
else window.location.replace("/dashboard");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleLinkCourier(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { 
      setError("Пожалуйста, введите Имя и Фамилию"); 
      return; 
    }
    
    setLoading(true); setError("");

    const cleanPhone = phone.replace(/[^\d+]/g, "");

    try {
      // Отправляем Имя, Фамилию и Телефон на сервер
      const res = await fetch("/api/auth/link-courier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone: cleanPhone })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Ошибка создания/привязки профиля");
      }
      window.location.replace("/courier/profile");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
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
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ivan@example.com" style={s.input} />

            <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textTransform: "none", color: "#6b6860", fontSize: 13, marginTop: 4, marginBottom: 14 }}>
              <input type="checkbox" checked={isOperator} onChange={e => setIsOperator(e.target.checked)} style={{ accentColor: "#4a7aff", width: 16, height: 16 }} />
              Войти как оператор
            </label>

            {isOperator && (
              <>
                <label style={s.label}>Секретный код</label>
                <input type="password" value={secretCode} onChange={e => setSecretCode(e.target.value)} placeholder="0000" style={s.input} />
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
            <input type="text" required value={code} onChange={e => setCode(e.target.value)} placeholder="123456" style={{ ...s.input, fontSize: 20, letterSpacing: 4, textAlign: "center", fontWeight: 600 }} />
            <button disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Проверка..." : "Войти"}
            </button>
            <button type="button" onClick={() => setStep(1)} style={s.back}>Изменить email</button>
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
                  type="text" 
                  required 
                  value={firstName} 
                  onChange={e => setFirstName(e.target.value)} 
                  placeholder="Иван" 
                  style={{...s.input, marginBottom: 0}} 
                />
              </div>

              <div>
                <label style={s.label}>Фамилия</label>
                <input 
                  type="text" 
                  required 
                  value={lastName} 
                  onChange={e => setLastName(e.target.value)} 
                  placeholder="Иванов" 
                  style={{...s.input, marginBottom: 0}} 
                />
              </div>

              <div>
                <label style={s.label}>Ваш номер телефона</label>
                <IMaskInput
                  mask="+7 (000) 000-00-00"
                  value={phone}
                  onAccept={(val: string) => setPhone(val)}
                  placeholder="+7 (___) ___-__-__"
                  style={{...s.input, marginBottom: 0}}
                />
              </div>

              <button 
                disabled={loading || phone.length < 18 || !firstName || !lastName} 
                style={{ ...s.btn, marginTop: 8, opacity: (phone.length >= 18 && firstName && lastName && !loading) ? 1 : 0.5 }}
              >
                {loading ? "Сохранение..." : "Начать работу"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f5f4f0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope, system-ui, sans-serif" },
  card: { background: "#fff", border: "1px solid #e8e6df", borderRadius: 20, padding: "32px 24px", width: "90%", maxWidth: 400, boxShadow: "0 10px 40px rgba(0,0,0,0.05)" },
  logoWrap: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 },
  logoText: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: 0 },
  sub: { fontSize: 13, color: "#6b6860", marginBottom: 20, textAlign: "center", lineHeight: "1.4" },
  label: { display: "block", fontSize: 11, color: "#a8a49c", marginBottom: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" },
  input: { width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid #e8e6df", background: "#fafaf8", color: "#1a1a18", fontSize: 16, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s", marginBottom: 12 },
  btn: { width: "100%", padding: "14px", borderRadius: 12, background: "#4a7aff", border: "none", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" },
  back: { background: "none", border: "none", color: "#4a7aff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 12, width: "100%" },
  err: { color: "#d94040", fontSize: 13, marginBottom: 16, textAlign: "center", background: "#fff8f8", padding: "10px", borderRadius: 10, border: "1px solid rgba(217,64,64,0.2)" },
};