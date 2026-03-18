"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setStep("code");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally { setLoading(false); }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Неверный код");
    } finally { setLoading(false); }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}><span style={s.dot} />FlowerOps</div>
        <p style={s.sub}>Платформа управления доставкой</p>
        <div style={s.dots}>
          <span style={{ ...s.stepDot, background: "#4a7aff" }} />
          <span style={{ ...s.stepDot, background: step === "code" ? "#4a7aff" : "#e8e6df" }} />
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode}>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" required autoFocus
              placeholder="operator@flower.ru" value={email}
              onChange={e => setEmail(e.target.value)} />
            {error && <p style={s.err}>{error}</p>}
            <button style={s.btn} disabled={loading}>
              {loading ? "Отправляем..." : "Получить код →"}
            </button>
            <p style={s.hint}>Код придёт на почту · действителен 10 минут</p>
          </form>
        ) : (
          <form onSubmit={verifyCode}>
            <label style={s.label}>Код из письма</label>
            <input style={{ ...s.input, fontSize: 24, letterSpacing: 8, textAlign: "center", fontWeight: 600 }}
              type="text" inputMode="numeric" maxLength={6} required autoFocus
              placeholder="——————" value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
            {error && <p style={s.err}>{error}</p>}
            <button style={s.btn} disabled={loading}>
              {loading ? "Проверяем..." : "Войти"}
            </button>
            <button type="button" style={s.back}
              onClick={() => { setStep("email"); setCode(""); setError(""); }}>
              ← Другой email
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
  logo: { fontSize: 20, fontWeight: 600, color: "#1a1a18", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4a7aff" },
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