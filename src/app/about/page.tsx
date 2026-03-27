// src/app/about/page.tsx
"use client";
import { useEffect } from "react";

export default function AboutPage() {
  useEffect(() => {
    document.title = "EventWave — Продвинутая система логистики";

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
      });
    });

    document.querySelectorAll('.toggle').forEach(t => {
      t.addEventListener('click', () => t.classList.toggle('on'));
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = '1';
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.route-card, .courier-card, .notif-item, .app-mockup').forEach(el => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Golos+Text:wght@400;500;600;700&display=swap" rel="stylesheet" />
      
      <div dangerouslySetInnerHTML={{ __html: HTML_CONTENT }} />
    </>
  );
}

const HTML_CONTENT = `
<style>
  :root {
    --bg: #080C14;
    --surface: #0D1420;
    --surface2: #121A2B;
    --border: rgba(56, 189, 248, 0.12);
    --accent: #38BDF8;
    --accent2: #7C3AED;
    --accent3: #10B981;
    --warn: #F59E0B;
    --danger: #EF4444;
    --text: #E2EBF8;
    --muted: #64748B;
    --card: #0F1825;
  }

  .landing-body * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }

  .landing-body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Golos Text', sans-serif;
    line-height: 1.6;
    overflow-x: hidden;
    min-height: 100vh;
    position: relative;
  }

  .landing-body::before {
    content: '';
    position: fixed; inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
    pointer-events: none; z-index: 0;
  }

  .landing-body header {
    position: fixed; top: 0; left: 0; right: 0;
    z-index: 100;
    padding: 0 2.5rem;
    height: 64px;
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(8,12,20,0.85);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
  }

  .landing-body .logo {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 2rem;
    letter-spacing: 0.12em;
    color: var(--accent);
    text-shadow: 0 0 40px rgba(56,189,248,0.5);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .landing-body .logo span { color: var(--text); }

  .landing-body nav { display: flex; gap: 2rem; }
  .landing-body nav a {
    font-size: 0.85rem; font-weight: 500; color: var(--muted);
    text-decoration: none; letter-spacing: 0.05em; text-transform: uppercase;
    transition: color 0.2s;
  }
  .landing-body nav a:hover { color: var(--accent); }

  .landing-body .btn-login {
    background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3);
    padding: 0.4rem 1.2rem; border-radius: 6px;
    color: var(--accent) !important; text-decoration: none; font-weight: 600;
    font-size: 0.85rem; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em;
  }
  .landing-body .btn-login:hover { background: var(--accent); color: #080C14 !important; }

  /* 🟢 ДОБАВЛЕННЫЕ СТИЛИ ДЛЯ КОНТАКТОВ 🟢 */
  .header-contact-icon {
    display: flex; align-items: center; justify-content: center; 
    width: 36px; height: 36px; border-radius: 50%; 
    text-decoration: none; transition: all 0.2s; font-size: 16px;
  }
  .header-contact-icon.phone { background: #f3f4f6; color: #4b5563; }
  .header-contact-icon.phone:hover { background: #e5e7eb; transform: scale(1.05); }
  
  .header-contact-icon.tg { background: #eff6ff; color: #3b82f6; font-size: 18px; }
  .header-contact-icon.tg:hover { background: #dbeafe; transform: scale(1.05); }

  .contact-pill {
    display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px;
    border-radius: 100px; text-decoration: none; font-weight: 600;
    font-size: 15px; transition: transform 0.2s ease;
  }
  .contact-pill:hover { transform: translateY(-2px); }
  .contact-pill.phone { background-color: #e8f5e9; color: #2e7d32; }
  .contact-pill.tg { background-color: #eef3ff; color: #4a7aff; }
  .contact-pill.email { background-color: #f5f4f0; color: #1a1a18; }
  /* 🔴 КОНЕЦ ДОБАВЛЕННЫХ СТИЛЕЙ 🔴 */

  .landing-body .hero {
    position: relative; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 6rem 2rem 4rem; overflow: hidden;
  }

  .landing-body .hero-grid {
    position: absolute; inset: 0;
    background-image: linear-gradient(rgba(56,189,248,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.04) 1px, transparent 1px);
    background-size: 60px 60px; mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%);
  }

  .landing-body .hero-glow {
    position: absolute; width: 700px; height: 700px; border-radius: 50%;
    background: radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%);
    top: 50%; left: 50%; transform: translate(-50%, -60%);
    animation: pulse 4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: translate(-50%, -60%) scale(1); opacity: 0.7; }
    50% { transform: translate(-50%, -60%) scale(1.08); opacity: 1; }
  }

  .landing-body .hero-content { position: relative; text-align: center; max-width: 900px; }

  .landing-body .hero-badge {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.35rem 1rem; border: 1px solid var(--border); border-radius: 2rem;
    font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 2rem; animation: fadeDown 0.6s ease both;
  }
  .landing-body .hero-badge::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 6px var(--accent);
    animation: blink 1.5s ease infinite;
  }
  @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }

  .landing-body .hero-title {
    font-family: 'Bebas Neue', sans-serif; font-size: clamp(4rem, 10vw, 9rem);
    letter-spacing: 0.04em; line-height: 0.92; color: var(--text);
    animation: fadeDown 0.7s 0.1s ease both;
  }
  .landing-body .hero-title .wave { color: var(--accent); text-shadow: 0 0 60px rgba(56,189,248,0.6); }

  .landing-body .hero-sub {
    margin-top: 1.8rem; font-size: 1.15rem; color: var(--muted); max-width: 680px;
    margin-left: auto; margin-right: auto; animation: fadeDown 0.7s 0.2s ease both;
  }

  .landing-body .hero-stats {
    margin-top: 4rem; display: flex; gap: 3rem; justify-content: center; flex-wrap: wrap;
    animation: fadeDown 0.7s 0.4s ease both;
  }
  .landing-body .stat { text-align: center; }
  .landing-body .stat-val { font-family: 'Bebas Neue', sans-serif; font-size: 2.8rem; color: var(--accent); line-height: 1; letter-spacing: 0.05em; }
  .landing-body .stat-label { font-size: 0.78rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 0.2rem; }

  @keyframes fadeDown {
    from { opacity: 0; transform: translateY(-16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .landing-body .scroll-hint {
    position: absolute; bottom: 2rem; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
    color: var(--muted); font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase;
    animation: float 2.5s ease-in-out infinite;
  }
  .landing-body .scroll-hint::after { content: ''; width: 1px; height: 40px; background: linear-gradient(to bottom, var(--muted), transparent); }
  @keyframes float { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(6px)} }

  .landing-body section { position: relative; z-index: 1; }
  .landing-body .section-inner { max-width: 1200px; margin: 0 auto; padding: 6rem 2rem; }
  .landing-body .section-label { font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin-bottom: 0.8rem; }
  .landing-body .section-title { font-family: 'Bebas Neue', sans-serif; font-size: clamp(2.5rem, 5vw, 4.5rem); letter-spacing: 0.04em; line-height: 1; margin-bottom: 1.2rem; }
  .landing-body .section-desc { color: var(--muted); font-size: 1rem; max-width: 600px; line-height: 1.7; }

  /* Остальные стили для модулей... */
  .landing-body .dash-section { background: var(--surface); }
  .landing-body .dash-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; margin-top: 4rem; }
  .landing-body .dash-mockup { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 1.5rem; box-shadow: 0 0 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04); position: relative; overflow: hidden; }
  .landing-body .mockup-bar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
  .landing-body .dot { width: 10px; height: 10px; border-radius: 50%; }
  .landing-body .dot-r { background: #EF4444; } .landing-body .dot-y { background: #F59E0B; } .landing-body .dot-g { background: #10B981; }
  .landing-body .mockup-title { font-size: 0.75rem; color: var(--muted); margin-left: 0.5rem; letter-spacing: 0.06em; }
  .landing-body .mockup-row { display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.8rem; border-radius: 8px; font-size: 0.78rem; margin-bottom: 0.4rem; transition: background 0.2s; cursor: default; }
  .landing-body .mockup-row:hover { background: rgba(56,189,248,0.06); }
  .landing-body .mockup-row.active { background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.2); }
  .landing-body .row-id { color: var(--muted); font-size: 0.7rem; width: 60px; }
  .landing-body .row-addr { color: var(--text); flex: 1; padding: 0 0.8rem; }
  .landing-body .row-time { color: var(--accent); font-size: 0.72rem; width: 50px; text-align: center; }
  .landing-body .badge { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.65rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
  .landing-body .badge-new { background: rgba(56,189,248,0.15); color: var(--accent); }
  .landing-body .badge-go { background: rgba(16,185,129,0.15); color: var(--accent3); }
  .landing-body .badge-done { background: rgba(100,116,139,0.15); color: var(--muted); }
  .landing-body .badge-err { background: rgba(239,68,68,0.15); color: var(--danger); }
  .landing-body .feature-list { list-style: none; }
  .landing-body .feature-list li { display: flex; gap: 1rem; align-items: flex-start; padding: 1rem 0; border-bottom: 1px solid var(--border); }
  .landing-body .feature-list li:last-child { border-bottom: none; }
  .landing-body .fi-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.2); display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
  .landing-body .fi-text h4 { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.2rem; }
  .landing-body .fi-text p { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }
  .landing-body .map-section { background: var(--bg); }
  .landing-body .map-layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: 3rem; align-items: center; margin-top: 4rem; }
  .landing-body .map-mockup { background: #0A1420; border: 1px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: 0 0 80px rgba(0,0,0,0.6); aspect-ratio: 4/3; position: relative; }
  .landing-body .map-mockup svg { width: 100%; height: 100%; }
  .landing-body .filter-bar { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .landing-body .filter-chip { padding: 0.35rem 0.9rem; border-radius: 2rem; font-size: 0.75rem; font-weight: 500; letter-spacing: 0.03em; border: 1px solid var(--border); background: var(--card); color: var(--muted); cursor: pointer; transition: all 0.2s; }
  .landing-body .filter-chip:hover, .landing-body .filter-chip.active { border-color: var(--accent); color: var(--accent); background: rgba(56,189,248,0.08); }
  .landing-body .filter-chip.morning.active { border-color: #F59E0B; color: #F59E0B; background: rgba(245,158,11,0.08); }
  .landing-body .filter-chip.day.active { border-color: #10B981; color: #10B981; background: rgba(16,185,129,0.08); }
  .landing-body .filter-chip.evening.active { border-color: var(--accent2); color: #A78BFA; background: rgba(124,58,237,0.08); }
  .landing-body .route-section { background: var(--surface); }
  .landing-body .route-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 4rem; }
  .landing-body .route-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 1.8rem; position: relative; overflow: hidden; transition: border-color 0.3s, transform 0.3s; }
  .landing-body .route-card:hover { border-color: rgba(56,189,248,0.35); transform: translateY(-3px); }
  .landing-body .route-card::before { content: attr(data-num); position: absolute; top: -0.5rem; right: 1rem; font-family: 'Bebas Neue', sans-serif; font-size: 5rem; color: rgba(56,189,248,0.04); line-height: 1; }
  .landing-body .rc-icon { font-size: 1.8rem; margin-bottom: 1rem; }
  .landing-body .rc-title { font-size: 1rem; font-weight: 700; margin-bottom: 0.5rem; }
  .landing-body .rc-desc { font-size: 0.82rem; color: var(--muted); line-height: 1.6; }
  .landing-body .route-demo { margin-top: 4rem; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 2rem; display: grid; grid-template-columns: 280px 1fr; gap: 2rem; align-items: start; }
  .landing-body .route-panel h4 { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 1rem; }
  .landing-body .route-stop { display: flex; gap: 0.8rem; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
  .landing-body .route-stop:last-child { border-bottom: none; }
  .landing-body .stop-num { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; flex-shrink: 0; }
  .landing-body .stop-addr { flex: 1; color: var(--text); }
  .landing-body .stop-time { color: var(--accent); font-size: 0.72rem; }
  .landing-body .stop-arrows { color: var(--muted); font-size: 0.9rem; cursor: pointer; }
  .landing-body .stop-arrows:hover { color: var(--accent); }
  .landing-body .couriers-section { background: var(--bg); }
  .landing-body .couriers-layout { display: grid; grid-template-columns: 1.2fr 1fr; gap: 3rem; align-items: start; margin-top: 4rem; }
  .landing-body .courier-list { display: flex; flex-direction: column; gap: 0.8rem; }
  .landing-body .courier-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1rem 1.2rem; display: flex; align-items: center; gap: 1rem; transition: border-color 0.2s; }
  .landing-body .courier-card:hover { border-color: rgba(56,189,248,0.3); }
  .landing-body .courier-ava { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--accent2), var(--accent)); display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 700; color: white; flex-shrink: 0; }
  .landing-body .courier-info { flex: 1; }
  .landing-body .courier-name { font-size: 0.88rem; font-weight: 600; }
  .landing-body .courier-meta { font-size: 0.72rem; color: var(--muted); }
  .landing-body .courier-orders { text-align: center; }
  .landing-body .courier-orders span:first-child { font-size: 1.2rem; font-weight: 700; color: var(--accent); display: block; line-height: 1; }
  .landing-body .courier-orders span:last-child { font-size: 0.65rem; color: var(--muted); }
  .landing-body .courier-badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.65rem; font-weight: 600; text-transform: uppercase; }
  .landing-body .cb-active { background: rgba(16,185,129,0.15); color: var(--accent3); }
  .landing-body .cb-paid { background: rgba(100,116,139,0.15); color: var(--muted); }
  .landing-body .cb-owe { background: rgba(245,158,11,0.15); color: var(--warn); }
  .landing-body .shift-cal { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.2rem; }
  .landing-body .cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  .landing-body .cal-title { font-size: 0.85rem; font-weight: 600; }
  .landing-body .cal-nav { font-size: 1rem; color: var(--muted); cursor: pointer; }
  .landing-body .cal-days-header { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; margin-bottom: 4px; }
  .landing-body .cal-dh { text-align: center; font-size: 0.62rem; color: var(--muted); padding: 2px; text-transform: uppercase; }
  .landing-body .cal-days { display: grid; grid-template-columns: repeat(7,1fr); gap: 3px; }
  .landing-body .cal-day { aspect-ratio: 1; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; cursor: pointer; transition: background 0.15s; position: relative; }
  .landing-body .cal-day:hover { background: rgba(56,189,248,0.1); }
  .landing-body .cal-day.empty { opacity: 0; }
  .landing-body .cal-day.today { border: 1px solid var(--accent); color: var(--accent); }
  .landing-body .cal-day.shift { background: rgba(16,185,129,0.2); color: var(--accent3); }
  .landing-body .cal-day.shift2 { background: rgba(56,189,248,0.15); color: var(--accent); }
  .landing-body .cal-day::after { content: ''; position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; }
  .landing-body .cal-day.shift::after { background: var(--accent3); }
  .landing-body .cal-day.shift2::after { background: var(--accent); }
  .landing-body .app-section { background: var(--surface); }
  .landing-body .app-mockup { width: 100%; max-width: 320px; margin: 0 auto; background: #FAFAF8; border: 8px solid #1A1A18; border-radius: 36px; padding: 1rem; position: relative; box-shadow: 0 20px 60px rgba(0,0,0,0.6); opacity: 0; transform: translateY(20px); transition: all 0.6s ease; }
  .landing-body .app-mockup[style*="opacity: 1"] { transform: translateY(0); }
  .landing-body .app-mockup::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 120px; height: 24px; background: #1A1A18; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; }
  .landing-body .app-header { margin-top: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #E8E6DF; display: flex; justify-content: space-between; align-items: center; }
  .landing-body .app-title { font-family: 'Golos Text'; font-weight: 700; color: #1A1A18; font-size: 1.1rem; }
  .landing-body .app-card { background: #FFF; border: 1px solid #E8E6DF; border-radius: 12px; padding: 1rem; margin-top: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
  .landing-body .app-card-title { color: #1A1A18; font-weight: 700; font-size: 0.95rem; line-height: 1.3; margin-bottom: 0.5rem; }
  .landing-body .app-btn { background: #4A7AFF; color: #FFF; border-radius: 10px; padding: 0.8rem; text-align: center; font-weight: 600; font-size: 0.85rem; margin-top: 0.8rem; cursor: pointer; }
  .landing-body .notif-section { background: var(--bg); }
  .landing-body .notif-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; margin-top: 4rem; }
  .landing-body .notif-stack { display: flex; flex-direction: column; gap: 0.8rem; }
  .landing-body .notif-item { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1rem 1.2rem; display: flex; gap: 0.8rem; align-items: flex-start; opacity: 0; transition: opacity 0.5s ease, transform 0.5s ease; transform: translateX(20px); }
  .landing-body .notif-item[style*="opacity: 1"] { transform: translateX(0); }
  .landing-body .notif-icon { font-size: 1.1rem; margin-top: 2px; }
  .landing-body .notif-body h5 { font-size: 0.82rem; font-weight: 600; margin-bottom: 0.15rem; }
  .landing-body .notif-body p { font-size: 0.75rem; color: var(--muted); }
  .landing-body .notif-time { margin-left: auto; font-size: 0.7rem; color: var(--muted); white-space: nowrap; }
  .landing-body .toggle-list { display: flex; flex-direction: column; gap: 0.7rem; }
  .landing-body .toggle-row { display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
  .landing-body .toggle-row:last-child { border-bottom: none; }
  .landing-body .toggle { width: 38px; height: 20px; border-radius: 10px; background: var(--surface2); border: 1px solid var(--border); position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
  .landing-body .toggle.on { background: var(--accent); }
  .landing-body .toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: white; transition: transform 0.2s; }
  .landing-body .toggle.on::after { transform: translateX(18px); }
  .landing-body .int-section { background: var(--surface); }
  .landing-body .int-badges { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: 3rem; justify-content: center; }
  .landing-body .int-badge { display: flex; align-items: center; gap: 0.7rem; padding: 0.8rem 1.4rem; background: var(--card); border: 1px solid var(--border); border-radius: 10px; font-size: 0.85rem; font-weight: 500; transition: border-color 0.2s, transform 0.2s; }
  .landing-body .int-badge:hover { border-color: rgba(56,189,248,0.4); transform: translateY(-2px); }
  .landing-body .int-badge .ib-icon { font-size: 1.3rem; }
  .landing-body .cta-section { background: var(--bg); text-align: center; padding-bottom: 6rem; }
  .landing-body .cta-card { max-width: 700px; margin: 0 auto; background: var(--card); border: 1px solid rgba(56,189,248,0.2); border-radius: 24px; padding: 4rem 3rem; position: relative; overflow: hidden; }
  .landing-body .cta-card::before { content: ''; position: absolute; width: 400px; height: 400px; border-radius: 50%; background: radial-gradient(circle, rgba(56,189,248,0.07) 0%, transparent 70%); top: -100px; left: 50%; transform: translateX(-50%); pointer-events: none; }
  .landing-body .cta-card h2 { font-family: 'Bebas Neue', sans-serif; font-size: clamp(2.5rem, 5vw, 4rem); letter-spacing: 0.05em; margin-bottom: 1rem; }
  .landing-body .cta-card p { color: var(--muted); margin-bottom: 2rem; }
  .landing-body .btn-primary { display: inline-flex; align-items: center; gap: 0.6rem; padding: 0.9rem 2.2rem; background: var(--accent); color: #080C14 !important; font-weight: 700; font-size: 0.9rem; border-radius: 8px; text-decoration: none; transition: box-shadow 0.2s, transform 0.2s; letter-spacing: 0.04em; }
  .landing-body .btn-primary:hover { box-shadow: 0 0 30px rgba(56,189,248,0.4); transform: translateY(-2px); }
  .landing-body footer { border-top: 1px solid var(--border); padding: 2rem; text-align: center; font-size: 0.78rem; color: var(--muted); }
  .landing-body .divider { height: 1px; background: linear-gradient(90deg, transparent, var(--border), transparent); margin: 0 2rem; }

  @media(max-width: 900px) {
    .landing-body .dash-layout, 
    .landing-body .map-layout, 
    .landing-body .couriers-layout, 
    .landing-body .notif-layout { grid-template-columns: 1fr; }
    .landing-body .route-grid { grid-template-columns: 1fr 1fr; }
    .landing-body .route-demo { grid-template-columns: 1fr; }
    .landing-body nav { display: none; }
  }
  @media(max-width: 600px) {
    .landing-body .route-grid { grid-template-columns: 1fr; }
    .landing-body .hero-stats { gap: 1.5rem; }
  }
</style>

<div class="landing-body">
  <header style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: var(--background); border-bottom: 1px solid var(--border);">
    
    <div class="logo" style="display: flex; align-items: center; gap: 8px;">
      <img src="/favicon.svg" alt="Logo" style="width: 32px; height: 32px; filter: drop-shadow(0 0 10px rgba(56,189,248,0.5));" />
      <div style="font-weight: 700; font-size: 1.25rem;">Event<span style="color: var(--accent);">Wave</span></div>
    </div>
    
    <div style="display: flex; align-items: center; gap: 2rem;">
      <nav style="display: flex; gap: 1.5rem;">
        <a href="#dashboard" style="color: var(--foreground); text-decoration: none; font-weight: 500;">Дашборд</a>
        <a href="#map" style="color: var(--foreground); text-decoration: none; font-weight: 500;">Карта</a>
        <a href="#routes" style="color: var(--foreground); text-decoration: none; font-weight: 500;">Маршруты</a>
        <a href="#couriers" style="color: var(--foreground); text-decoration: none; font-weight: 500;">Для курьеров</a>
        <a href="#integrations" style="color: var(--foreground); text-decoration: none; font-weight: 500;">Интеграции</a>
      </nav>

      <div style="display: flex; align-items: center; gap: 12px; border-left: 1px solid #e5e7eb; padding-left: 1.5rem; margin-left: -0.5rem;">
        <a href="tel:+79035124241" title="Позвонить нам" class="header-contact-icon phone">📞</a>
        <a href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer" title="Написать в Telegram" class="header-contact-icon tg">✈️</a>
      </div>

      <a href="/login" class="btn-login" style="margin-left: 0.5rem;">Войти</a>
    </div>
  </header>

  <section class="hero">
    <div class="hero-grid"></div>
    <div class="hero-glow"></div>
    <div class="hero-content">
      <div class="hero-badge">Система диспетчеризации и логистики</div>
      <h1 class="hero-title">EVENT<br><span class="wave">WAVE</span></h1>
      <p class="hero-sub">
        Единое рабочее пространство для логистов и курьеров. Умная маршрутизация, 
        моментальный отклик и <b>возможность подключения к любой CRM</b>.
      </p>
      
      <div style="margin-top: 2.5rem; animation: fadeDown 0.7s 0.3s ease both;">
        <a href="/login" class="btn-primary" style="font-size: 1.1rem; padding: 1rem 3rem;">Войти в систему →</a>
      </div>

      <div class="hero-stats">
        <div class="stat"><div class="stat-val">Любая</div><div class="stat-label">Поддержка CRM систем</div></div>
        <div class="stat"><div class="stat-val">1 сек</div><div class="stat-label">Отклик курьера</div></div>
        <div class="stat"><div class="stat-val">50+</div><div class="stat-label">Точек в маршруте</div></div>
        <div class="stat"><div class="stat-val">3–4×</div><div class="stat-label">Быстрее работа</div></div>
      </div>
    </div>
    <div class="scroll-hint">Листай вниз</div>
  </section>

  <section class="dash-section" id="dashboard">
    <div class="section-inner">
      <div class="section-label">Модуль 01</div>
      <h2 class="section-title">Интерактивный дашборд</h2>
      <p class="section-desc">Рабочий стол логиста с умной памятью интерфейса, живыми счетчиками и сквозной связью между картой и таблицей.</p>

      <div class="dash-layout">
        <div class="dash-mockup">
          <div class="mockup-bar">
            <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
            <span class="mockup-title">EventWave — Заказы сегодня &nbsp;·&nbsp; 24 заказа</span>
          </div>

          <div class="filter-bar" style="margin-bottom:1rem">
            <div class="filter-chip active">Все</div>
            <div class="filter-chip morning active">Утро 08–12</div>
            <div class="filter-chip day">День 12–17</div>
            <div class="filter-chip evening">Вечер 17–22</div>
            <div class="filter-chip">Новые</div>
            <div class="filter-chip">В пути</div>
            <div class="filter-chip">Готово</div>
          </div>

          <div class="mockup-row" style="border-bottom:1px solid var(--border);padding-bottom:0.6rem;margin-bottom:0.4rem">
            <div class="row-id" style="color:var(--muted);font-size:0.65rem">ID</div>
            <div class="row-addr" style="color:var(--muted);font-size:0.65rem">АДРЕС</div>
            <div class="row-time" style="color:var(--muted);font-size:0.65rem">СЛОТ</div>
            <div style="width:70px;text-align:center;color:var(--muted);font-size:0.65rem">СТАТУС</div>
            <div style="width:60px;text-align:center;color:var(--muted);font-size:0.65rem">КУРЬЕР</div>
          </div>

          <div class="mockup-row active">
            <div class="row-id">#4821</div>
            <div class="row-addr">ул. Ленина, 42, кв. 7</div>
            <div class="row-time">09:00</div>
            <div style="width:70px;text-align:center"><span class="badge badge-new">Новый</span></div>
            <div style="width:60px;text-align:center;font-size:0.72rem;color:var(--muted)">Антон</div>
          </div>
          <div class="mockup-row">
            <div class="row-id">#4819</div>
            <div class="row-addr">пр. Мира, 15</div>
            <div class="row-time">10:30</div>
            <div style="width:70px;text-align:center"><span class="badge badge-go">В пути</span></div>
            <div style="width:60px;text-align:center;font-size:0.72rem;color:var(--muted)">Дима</div>
          </div>
          <div class="mockup-row">
            <div class="row-id">#4815</div>
            <div class="row-addr">ул. Садовая, 3<span style="margin-left:4px;background:rgba(239,68,68,0.15);color:#EF4444;font-size:0.6rem;padding:1px 5px;border-radius:3px">!</span></div>
            <div class="row-time">11:00</div>
            <div style="width:70px;text-align:center"><span class="badge badge-err">Адрес?</span></div>
            <div style="width:60px;text-align:center;font-size:0.72rem;color:var(--muted)">—</div>
          </div>
          <div class="mockup-row">
            <div class="row-id">#4809</div>
            <div class="row-addr">б-р Строителей, 8/2</div>
            <div class="row-time">11:30</div>
            <div style="width:70px;text-align:center"><span class="badge badge-done">Доставлен</span></div>
            <div style="width:60px;text-align:center;font-size:0.72rem;color:var(--muted)">Антон</div>
          </div>
          <div class="mockup-row">
            <div class="row-id">#4802</div>
            <div class="row-addr">Советская ул., 101</div>
            <div class="row-time">12:00</div>
            <div style="width:70px;text-align:center"><span class="badge badge-new">Новый</span></div>
            <div style="width:60px;text-align:center;font-size:0.72rem;color:var(--muted)">—</div>
          </div>
        </div>

        <ul class="feature-list">
          <li>
            <div class="fi-icon">🧠</div>
            <div class="fi-text">
              <h4>Умная память интерфейса</h4>
              <p>Ширина колонок, скрытые панели, выбранная дата и мобильный вид сохраняются в памяти браузера — не нужно ничего настраивать заново.</p>
            </div>
          </li>
          <li>
            <div class="fi-icon">🔗</div>
            <div class="fi-text">
              <h4>Сквозной фокус</h4>
              <p>Клик на точку на карте — список слева и таблица снизу плавно прокручиваются к нужной строке. Связь элементов работает как единый организм.</p>
            </div>
          </li>
          <li>
            <div class="fi-icon">⚡</div>
            <div class="fi-text">
              <h4>Webhooks & Реал-тайм</h4>
              <p>Обновления статусов, курьеров и адресов из любой CRM прилетают за доли секунды без перезагрузки страницы.</p>
            </div>
          </li>
          <li>
            <div class="fi-icon">🔍</div>
            <div class="fi-text">
              <h4>Мгновенная сортировка</h4>
              <p>Живая таблица с моментальной сортировкой по любому параметру (времени, статусу, адресу, дате изменения) — один клик по заголовку колонки.</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <section class="map-section" id="map">
    <div class="section-inner">
      <div class="section-label">Модуль 02</div>
      <h2 class="section-title">Умная карта</h2>
      <p class="section-desc">Визуальный контроль географии доставок с автоматической кластеризацией, авто-геокодированием и лечением проблемных адресов.</p>

      <div class="map-layout">
        <div>
          <p style="font-size:0.85rem;color:var(--muted);margin-bottom:1.5rem">Фильтры карты — управление отображением одним кликом</p>

          <div class="filter-bar" style="flex-direction:column;gap:0.6rem">
            <div style="font-size:0.72rem;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:0.3rem">По временному слоту</div>
            <div style="display:flex;gap:0.5rem">
              <div class="filter-chip morning active">🌅 Утро 08–12</div>
              <div class="filter-chip day active">☀️ День 12–17</div>
              <div class="filter-chip evening active">🌙 Вечер 17–22</div>
            </div>
            <div style="font-size:0.72rem;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin:0.6rem 0 0.3rem">По курьеру</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <div class="filter-chip active">Все курьеры</div>
              <div class="filter-chip">Антон</div>
              <div class="filter-chip">Дима</div>
              <div class="filter-chip">Марина</div>
            </div>
            <div style="font-size:0.72rem;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin:0.6rem 0 0.3rem">По статусу заказа</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <div class="filter-chip active">Новые</div>
              <div class="filter-chip active">В пути</div>
              <div class="filter-chip">Доставлен</div>
              <div class="filter-chip danger" style="border-color:rgba(239,68,68,0.4);color:#EF4444;background:rgba(239,68,68,0.08)">⚠ Проблемные</div>
            </div>
            <div style="font-size:0.72rem;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin:0.6rem 0 0.3rem">Формат отображения</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <div class="filter-chip active">📍 Пины со временем</div>
              <div class="filter-chip">🤖 Лечение адресов</div>
              <div class="filter-chip">🔵 Кластеры</div>
            </div>
          </div>
          
          <p style="font-size:0.8rem;color:var(--muted);line-height:1.6;margin-top:1.5rem;">
            <strong style="color:var(--text)">Лечение проблемных адресов:</strong> Если адрес введен клиентом с опечаткой или без номера дома, система помечает его красным бейджем. Оператор прямо из интерфейса может вручную или с помощью умных подсказок уточнить адрес и перестроить координату.
          </p>
        </div>

        <div class="map-mockup">
          <svg viewBox="0 0 480 360" xmlns="http://www.w3.org/2000/svg">
            <rect width="480" height="360" fill="#0A1420"/>
            <g stroke="#1a2a3a" stroke-width="1" fill="none">
              <line x1="0" y1="80" x2="480" y2="80"/>
              <line x1="0" y1="160" x2="480" y2="160"/>
              <line x1="0" y1="240" x2="480" y2="240"/>
              <line x1="0" y1="310" x2="480" y2="310"/>
              <line x1="80" y1="0" x2="80" y2="360"/>
              <line x1="160" y1="0" x2="160" y2="360"/>
              <line x1="240" y1="0" x2="240" y2="360"/>
              <line x1="320" y1="0" x2="320" y2="360"/>
              <line x1="400" y1="0" x2="400" y2="360"/>
            </g>
            <g stroke="#1f3448" stroke-width="3" fill="none">
              <line x1="0" y1="160" x2="480" y2="160"/>
              <line x1="240" y1="0" x2="240" y2="360"/>
              <path d="M0,280 Q120,240 240,260 Q360,280 480,240"/>
            </g>

            <polyline points="80,290 140,200 200,130 280,100 360,150 420,220" stroke="rgba(56,189,248,0.6)" stroke-width="2" stroke-dasharray="6 4" fill="none"/>

            <circle cx="370" cy="70" r="22" fill="rgba(56,189,248,0.12)" stroke="rgba(56,189,248,0.4)" stroke-width="1.5"/>
            <text x="370" y="75" text-anchor="middle" fill="#38BDF8" font-size="11" font-family="Golos Text, sans-serif" font-weight="700">4</text>

            <g>
              <circle cx="80" cy="290" r="16" fill="rgba(245,158,11,0.15)" stroke="#F59E0B" stroke-width="1.5"/>
              <text x="80" y="294" text-anchor="middle" fill="#F59E0B" font-size="9" font-family="Golos Text, sans-serif" font-weight="700">09:00</text>
              <circle cx="140" cy="200" r="16" fill="rgba(245,158,11,0.15)" stroke="#F59E0B" stroke-width="1.5"/>
              <text x="140" y="204" text-anchor="middle" fill="#F59E0B" font-size="9" font-family="Golos Text, sans-serif" font-weight="700">10:30</text>
            </g>

            <g>
              <circle cx="200" cy="130" r="16" fill="rgba(16,185,129,0.15)" stroke="#10B981" stroke-width="1.5"/>
              <text x="200" y="134" text-anchor="middle" fill="#10B981" font-size="9" font-family="Golos Text, sans-serif" font-weight="700">13:00</text>
              <circle cx="280" cy="100" r="16" fill="rgba(16,185,129,0.15)" stroke="#10B981" stroke-width="1.5"/>
              <text x="280" y="104" text-anchor="middle" fill="#10B981" font-size="9" font-family="Golos Text, sans-serif" font-weight="700">14:30</text>
            </g>

            <g>
              <circle cx="360" cy="150" r="16" fill="rgba(124,58,237,0.15)" stroke="#7C3AED" stroke-width="1.5"/>
              <text x="360" y="154" text-anchor="middle" fill="#A78BFA" font-size="9" font-family="Golos Text, sans-serif" font-weight="700">18:00</text>
              <circle cx="420" cy="220" r="16" fill="rgba(124,58,237,0.15)" stroke="#7C3AED" stroke-width="1.5"/>
              <text x="420" y="224" text-anchor="middle" fill="#A78BFA" font-size="9" font-family="Golos Text, sans-serif" font-weight="700">19:30</text>
            </g>

            <g>
              <circle cx="310" cy="260" r="16" fill="rgba(239,68,68,0.15)" stroke="#EF4444" stroke-width="1.5"/>
              <text x="310" y="264" text-anchor="middle" fill="#EF4444" font-size="11" font-family="Golos Text, sans-serif" font-weight="700">!</text>
            </g>

            <circle cx="80" cy="290" r="22" fill="none" stroke="rgba(245,158,11,0.5)" stroke-width="2" stroke-dasharray="4 3">
              <animateTransform attributeName="transform" type="rotate" from="0 80 290" to="360 80 290" dur="8s" repeatCount="indefinite"/>
            </circle>

            <rect x="10" y="10" width="160" height="68" rx="6" fill="rgba(8,12,20,0.8)" stroke="rgba(56,189,248,0.15)" stroke-width="1"/>
            <circle cx="25" cy="28" r="5" fill="rgba(245,158,11,0.3)" stroke="#F59E0B" stroke-width="1"/>
            <text x="35" y="32" fill="#F59E0B" font-size="9" font-family="Golos Text, sans-serif">Утро 08–12</text>
            <circle cx="25" cy="45" r="5" fill="rgba(16,185,129,0.3)" stroke="#10B981" stroke-width="1"/>
            <text x="35" y="49" fill="#10B981" font-size="9" font-family="Golos Text, sans-serif">День 12–17</text>
            <circle cx="25" cy="62" r="5" fill="rgba(124,58,237,0.3)" stroke="#7C3AED" stroke-width="1"/>
            <text x="35" y="66" fill="#A78BFA" font-size="9" font-family="Golos Text, sans-serif">Вечер 17–22</text>
          </svg>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <section class="route-section" id="routes">
    <div class="section-inner">
      <div class="section-label">Модуль 03</div>
      <h2 class="section-title">Продвинутая маршрутизация</h2>
      <p class="section-desc">Массовое выделение заказов, автоматическая оптимизация логистики и назначение курьера за 1 клик.</p>

      <div class="route-grid">
        <div class="route-card" data-num="01">
          <div class="rc-icon">🖱️</div>
          <div class="rc-title">Визуальный сбор кустов</div>
          <div class="rc-desc">Перейдите в режим маршрута и кликайте по нужным точкам на карте — маршрут строится моментально.</div>
        </div>
        <div class="route-card" data-num="02">
          <div class="rc-icon">🚗</div>
          <div class="rc-title">Оптимизация пробега</div>
          <div class="rc-desc">Система генерирует лучший порядок точек через Яндекс.Навигатор с учётом пробок на авто или транспорте.</div>
        </div>
        <div class="route-card" data-num="03">
          <div class="rc-icon">👆</div>
          <div class="rc-title">Управление очередью</div>
          <div class="rc-desc">Точечно меняйте очередность доставки стрелочками прямо в боковой панели без возврата на карту.</div>
        </div>
        <div class="route-card" data-num="04">
          <div class="rc-icon">👥</div>
          <div class="rc-title">Массовое назначение</div>
          <div class="rc-desc">Выбрали 10 заказов? Назначьте на весь этот маршрут нужного курьера всего в один клик.</div>
        </div>
        <div class="route-card" data-num="05">
          <div class="rc-icon">🔗</div>
          <div class="rc-title">Ссылка курьеру</div>
          <div class="rc-desc">Копируйте готовую ссылку и отправляйте в мессенджер — курьеру останется нажать кнопку "Поехали".</div>
        </div>
        <div class="route-card" data-num="50">
          <div class="rc-icon">📍</div>
          <div class="rc-title">50 точек в маршруте</div>
          <div class="rc-desc">Мы сняли базовые ограничения. Поддерживается построение гигантских маршрутов до 50 точек.</div>
        </div>
      </div>

      <div class="route-demo">
        <div class="route-panel">
          <h4>Маршрут #12 — Антон · 8 точек</h4>

          <div class="route-stop">
            <div class="stop-num" style="background:rgba(245,158,11,0.2);color:#F59E0B;border:1px solid #F59E0B">1</div>
            <div class="stop-addr">ул. Ленина, 42</div>
            <div class="stop-time">09:00</div>
            <div class="stop-arrows">↑↓</div>
          </div>
          <div class="route-stop">
            <div class="stop-num" style="background:rgba(245,158,11,0.2);color:#F59E0B;border:1px solid #F59E0B">2</div>
            <div class="stop-addr">пр. Мира, 15</div>
            <div class="stop-time">09:40</div>
            <div class="stop-arrows">↑↓</div>
          </div>
          <div class="route-stop">
            <div class="stop-num" style="background:rgba(16,185,129,0.2);color:#10B981;border:1px solid #10B981">3</div>
            <div class="stop-addr">б-р Строителей, 8</div>
            <div class="stop-time">10:20</div>
            <div class="stop-arrows">↑↓</div>
          </div>
          <div class="route-stop">
            <div class="stop-num" style="background:rgba(16,185,129,0.2);color:#10B981;border:1px solid #10B981">4</div>
            <div class="stop-addr">Советская, 101</div>
            <div class="stop-time">11:00</div>
            <div class="stop-arrows">↑↓</div>
          </div>
          <div class="route-stop" style="opacity:0.5">
            <div class="stop-num" style="background:rgba(100,116,139,0.2);color:var(--muted);border:1px solid var(--muted)">5</div>
            <div class="stop-addr">ул. Садовая, 3</div>
            <div class="stop-time">11:30</div>
            <div class="stop-arrows">↑↓</div>
          </div>

          <div style="margin-top:1rem;display:flex;gap:0.6rem">
            <div style="flex:1;padding:0.55rem;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);border-radius:7px;font-size:0.75rem;text-align:center;color:var(--accent);cursor:pointer">
              📋 Копировать ссылку
            </div>
            <div style="padding:0.55rem 0.8rem;background:var(--surface2);border:1px solid var(--border);border-radius:7px;font-size:0.75rem;color:var(--muted);cursor:pointer">
              ✕
            </div>
          </div>
        </div>

        <div style="background:#0A1420;border-radius:12px;border:1px solid var(--border);overflow:hidden;min-height:240px">
          <svg viewBox="0 0 360 240" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
            <rect width="360" height="240" fill="#0A1420"/>
            <g stroke="#1a2a3a" stroke-width="1" fill="none">
              <line x1="0" y1="80" x2="360" y2="80"/>
              <line x1="0" y1="160" x2="360" y2="160"/>
              <line x1="90" y1="0" x2="90" y2="240"/>
              <line x1="180" y1="0" x2="180" y2="240"/>
              <line x1="270" y1="0" x2="270" y2="240"/>
            </g>
            <polyline points="50,200 90,140 140,95 200,120 260,80 310,140" stroke="rgba(56,189,248,0.7)" stroke-width="2.5" stroke-dasharray="8 5" fill="none"/>
            <circle cx="50" cy="200" r="13" fill="rgba(245,158,11,0.2)" stroke="#F59E0B" stroke-width="1.5"/>
            <text x="50" y="204" text-anchor="middle" fill="#F59E0B" font-size="9" font-family="Golos Text" font-weight="700">1</text>
            <circle cx="90" cy="140" r="13" fill="rgba(245,158,11,0.2)" stroke="#F59E0B" stroke-width="1.5"/>
            <text x="90" y="144" text-anchor="middle" fill="#F59E0B" font-size="9" font-family="Golos Text" font-weight="700">2</text>
            <circle cx="140" cy="95" r="13" fill="rgba(16,185,129,0.2)" stroke="#10B981" stroke-width="1.5"/>
            <text x="140" y="99" text-anchor="middle" fill="#10B981" font-size="9" font-family="Golos Text" font-weight="700">3</text>
            <circle cx="200" cy="120" r="13" fill="rgba(16,185,129,0.2)" stroke="#10B981" stroke-width="1.5"/>
            <text x="200" y="124" text-anchor="middle" fill="#10B981" font-size="9" font-family="Golos Text" font-weight="700">4</text>
            <circle cx="260" cy="80" r="13" fill="rgba(100,116,139,0.2)" stroke="var(--muted)" stroke-width="1.5"/>
            <text x="260" y="84" text-anchor="middle" fill="var(--muted)" font-size="9" font-family="Golos Text" font-weight="700">5</text>
            <rect x="8" y="8" width="100" height="28" rx="5" fill="rgba(8,12,20,0.85)" stroke="rgba(56,189,248,0.15)" stroke-width="1"/>
            <text x="16" y="20" fill="#38BDF8" font-size="8" font-family="Golos Text" font-weight="700">МАРШРУТ #12</text>
            <text x="16" y="30" fill="var(--muted)" font-size="8" font-family="Golos Text">~18.4 км · ~54 мин</text>
          </svg>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <section class="couriers-section" id="couriers">
    <div class="section-inner">
      <div class="section-label">Модуль 04</div>
      <h2 class="section-title">Проверенные курьеры и финансы</h2>
      <p class="section-desc">Единая база надежных исполнителей. Умное ранжирование сотрудников при назначении доставок, календарный график смен и прозрачный контроль взаиморасчётов.</p>

      <div class="couriers-layout">
        <div>
          <p style="font-size:0.8rem;color:var(--muted);margin-bottom:1rem">Система предлагает первыми тех, кто сейчас свободен или везет заказы в тот же район</p>
          <div class="courier-list">
            <div class="courier-card" style="border-color:rgba(16,185,129,0.3)">
              <div class="courier-ava">АК</div>
              <div class="courier-info">
                <div class="courier-name">Антон Краснов</div>
                <div class="courier-meta">Рейтинг 5.0 · 3 заказа в пути</div>
              </div>
              <div class="courier-orders"><span>7</span><span>сегодня</span></div>
              <div><span class="courier-badge cb-active">Готов взять</span></div>
            </div>
            <div class="courier-card" style="border-color:rgba(56,189,248,0.3)">
              <div class="courier-ava" style="background:linear-gradient(135deg,#10B981,#38BDF8)">ДМ</div>
              <div class="courier-info">
                <div class="courier-name">Дима Максимов</div>
                <div class="courier-meta">Рейтинг 4.9 · Смена сегодня</div>
              </div>
              <div class="courier-orders"><span>5</span><span>сегодня</span></div>
              <div><span class="courier-badge cb-active">На смене</span></div>
            </div>
            <div class="courier-card">
              <div class="courier-ava" style="background:linear-gradient(135deg,#F59E0B,#EF4444)">МС</div>
              <div class="courier-info">
                <div class="courier-name">Марина Сидорова</div>
                <div class="courier-meta">Выходной · расчёт за 12.03</div>
              </div>
              <div class="courier-orders"><span>—</span><span>сегодня</span></div>
              <div><span class="courier-badge cb-owe">Долг 1 200₽</span></div>
            </div>
            <div class="courier-card">
              <div class="courier-ava" style="background:linear-gradient(135deg,#64748B,#475569)">ВП</div>
              <div class="courier-info">
                <div class="courier-name">Витя Петров</div>
                <div class="courier-meta">Последняя смена 11.03</div>
              </div>
              <div class="courier-orders"><span>—</span><span>сегодня</span></div>
              <div><span class="courier-badge cb-paid">Расчёт ✓</span></div>
            </div>
          </div>
        </div>

        <div>
          <ul class="feature-list" style="margin-top:0">
            <li>
              <div class="fi-icon">🛡️</div>
              <div class="fi-text">
                <h4>База проверенных исполнителей</h4>
                <p>Работайте только с надежными курьерами. История доставок, статистика и финансовый контроль в один клик.</p>
              </div>
            </li>
            <li>
              <div class="fi-icon">🎯</div>
              <div class="fi-text">
                <h4>Умное распределение</h4>
                <p>Не нужно обзванивать водителей. Система сама подскажет, кому выгоднее и быстрее передать новый заказ.</p>
              </div>
            </li>
          </ul>

          <p style="font-size:0.8rem;color:var(--muted);margin-top:2rem;margin-bottom:1rem">Календарь выхода на смену</p>
          <div class="shift-cal">
            <div class="cal-header">
              <span class="cal-nav">‹</span>
              <span class="cal-title">Март 2026</span>
              <span class="cal-nav">›</span>
            </div>
            <div class="cal-days-header">
              <div class="cal-dh">Пн</div><div class="cal-dh">Вт</div><div class="cal-dh">Ср</div>
              <div class="cal-dh">Чт</div><div class="cal-dh">Пт</div><div class="cal-dh">Сб</div><div class="cal-dh">Вс</div>
            </div>
            <div class="cal-days">
              <div class="cal-day empty"></div><div class="cal-day empty"></div><div class="cal-day empty"></div>
              <div class="cal-day empty"></div><div class="cal-day empty"></div>
              <div class="cal-day">1</div><div class="cal-day">2</div>
              <div class="cal-day shift">3</div><div class="cal-day shift2">4</div><div class="cal-day shift">5</div>
              <div class="cal-day shift2">6</div><div class="cal-day shift">7</div><div class="cal-day">8</div><div class="cal-day">9</div>
              <div class="cal-day shift">10</div><div class="cal-day shift2">11</div><div class="cal-day shift">12</div>
              <div class="cal-day shift2">13</div><div class="cal-day shift">14</div><div class="cal-day">15</div><div class="cal-day">16</div>
              <div class="cal-day shift">17</div><div class="cal-day shift2">18</div><div class="cal-day shift">19</div>
              <div class="cal-day shift2">20</div><div class="cal-day today shift">21</div><div class="cal-day">22</div><div class="cal-day">23</div>
              <div class="cal-day">24</div><div class="cal-day">25</div><div class="cal-day">26</div>
              <div class="cal-day">27</div><div class="cal-day">28</div><div class="cal-day">29</div><div class="cal-day">30</div>
              <div class="cal-day">31</div>
            </div>
            <div style="display:flex;gap:1rem;margin-top:1rem;font-size:0.72rem;color:var(--muted)">
              <div style="display:flex;align-items:center;gap:0.4rem"><div style="width:10px;height:10px;border-radius:3px;background:rgba(16,185,129,0.2);border:1px solid #10B981"></div>Антон</div>
              <div style="display:flex;align-items:center;gap:0.4rem"><div style="width:10px;height:10px;border-radius:3px;background:rgba(56,189,248,0.15);border:1px solid #38BDF8"></div>Дима</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <section class="app-section" id="courier-app">
    <div class="section-inner">
      <div class="section-label">Модуль 05</div>
      <h2 class="section-title">Приложение для курьеров (PWA)</h2>
      <p class="section-desc">Полноценное мобильное приложение для курьеров, которое работает прямо из браузера. Никаких скачиваний из AppStore или Google Play — моментальный доступ.</p>

      <div class="dash-layout">
        <ul class="feature-list">
          <li>
            <div class="fi-icon">🚀</div>
            <div class="fi-text">
              <h4>Моментальный отклик</h4>
              <p>Курьер получает уведомление, нажимает кнопку <b>«Поехал сюда»</b>, и статус заказа в CRM логиста обновляется за 1 секунду.</p>
            </div>
          </li>
          <li>
            <div class="fi-icon">🔐</div>
            <div class="fi-text">
              <h4>Вход без паролей</h4>
              <p>Водителям не нужно запоминать сложные логины. Вход осуществляется по безопасному одноразовому 6-значному коду из Email.</p>
            </div>
          </li>
          <li>
            <div class="fi-icon">📍</div>
            <div class="fi-text">
              <h4>Встроенная навигация</h4>
              <p>Внутри каждого маршрута есть прямая кнопка "Открыть в Яндекс.Навигаторе", которая сразу строит маршрут до двери клиента без ручного ввода адреса.</p>
            </div>
          </li>
        </ul>

        <div class="app-mockup">
          <div class="app-header">
            <div class="app-title">Карта доставок</div>
            <div style="font-size:0.8rem;color:#A8A49C;font-family:'Golos Text'">4 точки</div>
          </div>
          
          <div style="background:#E8E6DF; border-radius:12px; height:140px; margin-top:1rem; position:relative; overflow:hidden">
            <div style="position:absolute; top:40%; left:50%; width:16px; height:16px; background:#10B981; border:3px solid #FFF; border-radius:50%; transform:translate(-50%,-50%)"></div>
            <div style="position:absolute; top:60%; left:30%; width:16px; height:16px; background:#1A1A18; border:3px solid #FFF; border-radius:50%; transform:translate(-50%,-50%)"></div>
          </div>

          <div class="app-card">
            <div style="font-size:0.7rem; color:#4A7AFF; font-weight:700; text-transform:uppercase; margin-bottom:4px">🚀 Ожидает</div>
            <div class="app-card-title">ул. Ленина, 42, кв. 7</div>
            <div style="font-size:0.75rem; color:#6B6860">Заказ #4821 · Слот: 09:00 - 12:00</div>
            
            <div style="background:#F5F4F0; padding:8px; border-radius:8px; display:flex; justify-content:space-between; margin-top:10px; font-size:0.8rem; font-weight:600; color:#1A1A18">
              <span>📍 5.2 км</span>
              <span>⏱ 12 мин</span>
            </div>

            <div class="app-btn">Поехал сюда</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <section class="notif-section" id="notifications">
    <div class="section-inner">
      <div class="section-label">Модуль 06</div>
      <h2 class="section-title">Push-уведомления и профиль</h2>
      <p class="section-desc">Система информирует о важных событиях даже если вкладка браузера свёрнута. Доступна точечная настройка для каждого логиста.</p>

      <div class="notif-layout">
        <div>
          <p style="font-size:0.8rem;color:var(--muted);margin-bottom:1.2rem">Входящие push-уведомления сегодня</p>
          <div class="notif-stack">
            <div class="notif-item">
              <div class="notif-icon">📦</div>
              <div class="notif-body">
                <h5>Новый заказ #4825</h5>
                <p>Адрес: ул. Гагарина, 88 · Слот 15:00–18:00</p>
              </div>
              <div class="notif-time">11:42</div>
            </div>
            <div class="notif-item" style="border-color:rgba(239,68,68,0.25)">
              <div class="notif-icon">🔴</div>
              <div class="notif-body">
                <h5>Проблемный адрес в #4815</h5>
                <p>Адрес не геокодирован — требует уточнения</p>
              </div>
              <div class="notif-time">10:15</div>
            </div>
            <div class="notif-item" style="border-color:rgba(16,185,129,0.2)">
              <div class="notif-icon">✅</div>
              <div class="notif-body">
                <h5>Заказ #4809 доставлен</h5>
                <p>Антон Краснов завершил доставку</p>
              </div>
              <div class="notif-time">09:58</div>
            </div>
          </div>
        </div>

        <div>
          <p style="font-size:0.8rem;color:var(--muted);margin-bottom:1.2rem">Гибкая настройка профиля оператора</p>
          <div class="toggle-list">
            <div class="toggle-row">
              <div>
                <div style="font-size:0.85rem;font-weight:500">📦 Новые заказы</div>
                <div style="font-size:0.72rem;color:var(--muted)">При появлении нового заказа в CRM</div>
              </div>
              <div class="toggle on"></div>
            </div>
            <div class="toggle-row">
              <div>
                <div style="font-size:0.85rem;font-weight:500">🔴 Ошибки адреса</div>
                <div style="font-size:0.72rem;color:var(--muted)">Адрес клиента не распознан Яндексом</div>
              </div>
              <div class="toggle on"></div>
            </div>
            <div class="toggle-row">
              <div>
                <div style="font-size:0.85rem;font-weight:500">📍 Изменение адреса</div>
                <div style="font-size:0.72rem;color:var(--muted)">Менеджер изменил адрес доставки</div>
              </div>
              <div class="toggle on"></div>
            </div>
            <div class="toggle-row">
              <div>
                <div style="font-size:0.85rem;font-weight:500">🔄 Смена курьера</div>
                <div style="font-size:0.72rem;color:var(--muted)">Назначен другой курьер на заказ</div>
              </div>
              <div class="toggle"></div>
            </div>
            <div class="toggle-row">
              <div>
                <div style="font-size:0.85rem;font-weight:500">✅ Доставка завершена</div>
                <div style="font-size:0.72rem;color:var(--muted)">Изменение публичного статуса заказа</div>
              </div>
              <div class="toggle"></div>
            </div>
          </div>

          <div style="margin-top:2rem">
            <p style="font-size:0.72rem;color:var(--muted);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:0.8rem">Мобильная адаптивность</p>
            <div style="display:flex;gap:0.5rem">
              <div style="flex:1;padding:0.7rem;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.4);border-radius:8px;text-align:center;font-size:0.75rem;color:var(--accent);cursor:pointer">🗺 Только карта</div>
              <div style="flex:1;padding:0.7rem;background:var(--card);border:1px solid var(--border);border-radius:8px;text-align:center;font-size:0.75rem;color:var(--muted);cursor:pointer">📋 Только списки</div>
              <div style="flex:1;padding:0.7rem;background:var(--card);border:1px solid var(--border);border-radius:8px;text-align:center;font-size:0.75rem;color:var(--muted);cursor:pointer">⊟ Разделённый</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <section class="int-section" id="integrations">
    <div class="section-inner" style="padding-top:4rem;padding-bottom:4rem">
      <div class="section-label">Интеграции</div>
      <h2 class="section-title">Подключение к любой CRM</h2>
      <p class="section-desc">EventWave работает как мощный логистический хаб. Благодаря нашему универсальному API и системе Webhooks, вы можете подключить систему к вашему бизнесу за пару дней.</p>

      <div class="int-badges">
        <div class="int-badge">
          <span class="ib-icon">🔄</span>
          <div>
            <div style="font-weight:600">Собственное API</div>
            <div style="font-size:0.72rem;color:var(--muted)">Подключение к любой самописной CRM</div>
          </div>
        </div>
        <div class="int-badge">
          <span class="ib-icon">🛒</span>
          <div>
            <div style="font-weight:600">RetailCRM / Amo / Битрикс</div>
            <div style="font-size:0.72rem;color:var(--muted)">Двусторонняя синхронизация статусов</div>
          </div>
        </div>
        <div class="int-badge">
          <span class="ib-icon">🗺</span>
          <div>
            <div style="font-weight:600">Яндекс.Карты</div>
            <div style="font-size:0.72rem;color:var(--muted)">Геокодирование и умные маршруты</div>
          </div>
        </div>
        <div class="int-badge">
          <span class="ib-icon">🤖</span>
          <div>
            <div style="font-weight:600">ИИ Ассистент</div>
            <div style="font-size:0.72rem;color:var(--muted)">Умное лечение проблемных адресов</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="cta-section">
    <div class="section-inner" style="padding-top: 2rem;">
      <div class="cta-card">
        <h2>Готовы ускорить логистику?</h2>
        <p>EventWave берёт на себя рутину. Логисты работают в 3–4 раза быстрее, а курьеры получают маршруты моментально в удобном приложении без паролей.</p>
        <a href="/login" class="btn-primary">Войти в систему →</a>
      </div>
      
      <div style="margin-top: 4rem; text-align: center; padding-bottom: 2rem;">
        <h3 style="font-size: 1.4rem; font-weight: 700; color: var(--text); margin-bottom: 0.5rem;">
          Остались вопросы?
        </h3>
        <p style="font-size: 1.1rem; color: var(--muted); margin-bottom: 1.5rem;">
          Свяжитесь с нами, ответит Иван:
        </p>
        
        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          <a href="tel:+79035124241" class="contact-pill phone">
            <span style="font-size: 1.2rem;">📞</span> +7 (903) 512-42-41
          </a>
          <a href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer" class="contact-pill tg">
            <span style="font-size: 1.2rem;">✈️</span> @weareventwave
          </a>
          <a href="mailto:intoaivan@gmail.com" class="contact-pill email">
            <span style="font-size: 1.2rem;">📧</span> intoaivan@gmail.com
          </a>
        </div>
      </div>
    </div>
  </section>

  <footer>
    <div style="margin-bottom: 8px;">EventWave © 2026 &nbsp;·&nbsp; Продвинутая система диспетчеризации и логистики</div>
    <div style="font-size: 0.7rem; color: var(--muted);">Сайт сделан и размещен на <a href="https://relaxdev.ru" target="_blank" style="color: var(--accent); text-decoration: none; font-weight: 500;">relaxdev.ru</a></div>
  </footer>
</div>
`;