// src/app/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Ролевая модель
  const [isOperator, setIsOperator] = useState(false);
  const [secretCode, setSecretCode] = useState("");

  const router = useRouter();

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
      
      // Маршрутизация по ролям
      if (data.role === "COURIER") {
        router.push("/courier/points");
      } else {
        router.push("/");
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f5f4f0", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "#fff", padding: "40px", borderRadius: 16, width: "100%", maxWidth: 360, boxShadow: "0 10px 40px rgba(0,0,0,0.05)", border: "1px solid #e8e6df" }}>
        
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }}>
          <img src="/favicon.svg" alt="Logo" style={{ width: 32, height: 32 }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: 0 }}>EventWave</h1>
        </div>

        {error && <div style={{ color: "#d94040", fontSize: 13, marginBottom: 16, textAlign: "center", background: "#fff8f8", padding: "8px", borderRadius: 8, border: "1px solid rgba(217,64,64,0.2)" }}>{error}</div>}

        {step === 1 ? (
          <form onSubmit={handleSendCode} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="ivan@example.com" style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #e8e6df", fontSize: 15, background: "#fafaf8", outline: "none", boxSizing: "border-box" }} />
            </div>
            
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6b6860", cursor: "pointer", marginTop: 4 }}>
              <input type="checkbox" checked={isOperator} onChange={e => setIsOperator(e.target.checked)} style={{ accentColor: "#4a7aff", width: 16, height: 16 }} />
              Войти как оператор
            </label>

            {isOperator && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Секретный код</label>
                <input type="password" value={secretCode} onChange={e => setSecretCode(e.target.value)} placeholder="0000" style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #e8e6df", fontSize: 15, background: "#fafaf8", outline: "none", boxSizing: "border-box" }} />
              </div>
            )}

            <button disabled={loading} style={{ background: "#4a7aff", color: "#fff", border: "none", padding: "12px", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8, transition: "opacity 0.2s" }}>
              {loading ? "Отправка..." : "Получить код"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 14, color: "#6b6860", textAlign: "center", marginBottom: 8 }}>Код отправлен на <b>{email}</b></div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Код из письма</label>
              <input type="text" required value={code} onChange={e => setCode(e.target.value)} placeholder="123456" style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #e8e6df", fontSize: 20, letterSpacing: 4, textAlign: "center", background: "#fafaf8", outline: "none", boxSizing: "border-box", fontWeight: 600 }} />
            </div>
            <button disabled={loading} style={{ background: "#4a7aff", color: "#fff", border: "none", padding: "12px", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
              {loading ? "Проверка..." : "Войти"}
            </button>
            <button type="button" onClick={() => setStep(1)} style={{ background: "transparent", color: "#6b6860", border: "none", fontSize: 13, cursor: "pointer", marginTop: -4 }}>
              Изменить email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f5f4f0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope, system-ui, sans-serif" },
  card: { background: "#fff", border: "1px solid #e8e6df", borderRadius: 16, padding: "40px 36px", width: 360, boxShadow: "0 2px 20px rgba(0,0,0,0.06)" },
  sub: { fontSize: 12, color: "#a8a49c", marginBottom: 24 },
  dots: { display: "flex", gap: 5, marginBottom: 24 },
  stepDot: { display: "block", width: 6, height: 6, borderRadius: "50%", transition: "background .2s" },
  label: { display: "block", fontSize: 11, color: "#6b6860", marginBottom: 6, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.4px" },
  input: { width: "100%", padding: "11px 13px", borderRadius: 8, border: "1px solid #e8e6df", background: "#fafaf8", color: "#1a1a18", fontSize: 14, outline: "none", marginBottom: 14 },
  btn: { width: "100%", padding: 12, borderRadius: 8, background: "#4a7aff", border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10 },
  back: { background: "none", border: "none", color: "#a8a49c", fontSize: 12, cursor: "pointer", padding: 0, display: "block", margin: "0 auto" },
  err: { color: "#d94040", fontSize: 12, marginBottom: 10, background: "rgba(217,64,64,0.07)", padding: "7px 10px", borderRadius: 6 },
  hint: { fontSize: 11, color: "#a8a49c", textAlign: "center" as const },
};
