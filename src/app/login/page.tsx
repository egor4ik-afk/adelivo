// src/app/login/page.tsx
"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [isOperator, setIsOperator] = useState(false);
  const [secretCode, setSecretCode] = useState("");

  // Для Шага 3 (привязка курьера)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [couriers, setCouriers] = useState<any[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState("");
  const [phone, setPhone] = useState("");

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
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
        body: JSON.stringify({ email, code, secretCode: isOperator ? secretCode : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Шаг 3: Загрузка и ФИЛЬТРАЦИЯ курьеров
      if (data.role === "COURIER" && !data.linked) {
        const cRes = await fetch("/api/couriers");
        if (cRes.ok) {
          const cData = await cRes.json();
          
          // 🔥 СПИСОК СЛОВ-МУСОРА ДЛЯ ОТСЕВА ИЗ CRM
          const BAD_WORDS = ["сдэк", "яндекс", "доставк", "курьер", "тест", "пеший", "авто", "logisty", "dostavista"];
          
          const validCouriers = cData.filter((c: any) => {
            // 1. Проверяем, что курьер активен, еще не привязан к почте и у него есть имя
            if (!c.isActive || c.email || !c.fullName) return false;
            
            const lowerName = c.fullName.toLowerCase();
            
            // 2. Отсеиваем слишком короткие имена (глюки CRM)
            if (c.fullName.trim().length < 3) return false;
            
            // 3. Отсеиваем мусорные слова
            if (BAD_WORDS.some(word => lowerName.includes(word))) return false;

            return true; // Если прошел все проверки - показываем в списке
          });

          // Сортируем по алфавиту для удобства
          validCouriers.sort((a: any, b: any) => a.fullName.localeCompare(b.fullName));
          setCouriers(validCouriers);
        }
        setStep(3);
        return;
      }

      if (data.role === "COURIER") window.location.href = "/courier/points";
      else window.location.href = "/dashboard";
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleLinkCourier(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/link-courier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierId: selectedCourierId, phone }) 
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Ошибка привязки профиля");
      }
      window.location.href = "/courier/points";
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
          <form onSubmit={handleLinkCourier} style={{ display: "flex", flexDirection: "column" }}>
            <div style={s.sub}>
              <div style={{ fontSize: 14, color: "#1a1a18", fontWeight: 600, marginBottom: 4 }}>Добро пожаловать!</div>
              Остался последний шаг. Выберите свой профиль.
            </div>
            
            <label style={s.label}>Ваш профиль курьера</label>
            <select required value={selectedCourierId} onChange={e => setSelectedCourierId(e.target.value)} style={{ ...s.input, WebkitAppearance: "none", cursor: "pointer" }}>
              <option value="" disabled>— Выберите профиль —</option>
              {couriers.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
            </select>

            <label style={s.label}>Номер телефона (обязательно)</label>
            <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (999) 000-00-00" style={s.input} />

            <button disabled={loading || !selectedCourierId || !phone} style={{ ...s.btn, opacity: (selectedCourierId && phone && !loading) ? 1 : 0.5 }}>
              {loading ? "Сохранение..." : "Начать работу"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// 🔥 ВЕРНУЛИ КРАСИВЫЕ СТИЛИ
const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f5f4f0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope, system-ui, sans-serif" },
  card: { background: "#fff", border: "1px solid #e8e6df", borderRadius: 16, padding: "40px 36px", width: 100, minWidth: 360, maxWidth: 400, boxShadow: "0 10px 40px rgba(0,0,0,0.05)" },
  logoWrap: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 },
  logoText: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: 0 },
  sub: { fontSize: 13, color: "#6b6860", marginBottom: 20, textAlign: "center" },
  label: { display: "block", fontSize: 11, color: "#a8a49c", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" },
  input: { width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #e8e6df", background: "#fafaf8", color: "#1a1a18", fontSize: 15, outline: "none", marginBottom: 16, boxSizing: "border-box" },
  btn: { width: "100%", padding: 12, borderRadius: 8, background: "#4a7aff", border: "none", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10, transition: "opacity 0.2s" },
  back: { background: "none", border: "none", color: "#a8a49c", fontSize: 13, cursor: "pointer", padding: 0, display: "block", margin: "0 auto", marginTop: -4 },
  err: { color: "#d94040", fontSize: 13, marginBottom: 16, textAlign: "center", background: "#fff8f8", padding: "8px", borderRadius: 8, border: "1px solid rgba(217,64,64,0.2)" },
};