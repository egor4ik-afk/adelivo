// src/components/layout/AppHeader.tsx
import Image from "next/image";
import Link from "next/link";
import { C } from "@/components/theme/theme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";


const css = `
  .ew-hdr{position:sticky;top:0;z-index:100;background:var(--ew-hdr-bg);backdrop-filter:blur(16px);border-bottom:1px solid ${C.border}}
  .ew-hdr .wrap{max-width:1160px;margin:0 auto;padding:0 1.5rem}
  .ew-hdr .inner{height:64px;display:flex;align-items:center;justify-content:space-between;gap:1rem}
  .ew-logo{display:flex;align-items:center;gap:10px;flex-shrink:0}
  .ew-logo-txt{font-weight:800;font-size:1.1rem;color:${C.text};letter-spacing:0.05em}
  .ew-logo-txt span{color:${C.accent}}
  .ew-nav{display:flex;gap:1.5rem; list-style:none; padding:0; margin:0;}
  .ew-nav a{color:${C.muted};font-size:0.83rem;font-weight:500;transition:color .2s}
  .ew-nav a:hover{color:${C.text}}
  .ew-hbtns{display:flex;gap:0.6rem;flex-shrink:0;align-items:center}
  .btn-hdr-pri{padding:0.5rem 1.1rem;border-radius:8px;background:${C.accent};color:var(--ew-accent-contrast);font-size:0.82rem;font-weight:700}
  .btn-hdr-icon{background:transparent;cursor:pointer;font:inherit;display:inline-flex;align-items:center;justify-content:center;padding:0.45rem;border-radius:7px;border:1px solid ${C.border};color:${C.muted};transition:color .2s,border-color .2s}
  .btn-hdr-icon:hover{color:${C.text};border-color:${C.accent}}

  @media(max-width:1100px){
    .ew-nav{display:none}
  }
`;

export function AppHeader() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <header className="ew-hdr">
        <div className="wrap">
          <div className="inner">
            <Link href="/" className="ew-logo" aria-label="ADelivo — главная">
              <Image src="/web-app-manifest-192x192.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
              <span className="ew-logo-txt">Agent<span>Delivo</span></span>
            </Link>
            <nav aria-label="Основная навигация">
              <ul className="ew-nav">
                <li><Link href="/sistema-upravleniya-kurerami">Платформа</Link></li>
                <li><Link href="/vozmozhnosti/interfeysy">3 экрана</Link></li>
                <li><Link href="/ai-marshrutizaciya">AI-маршруты</Link></li>
                <li><Link href="/integracii">Интеграции</Link></li>
                <li><Link href="/keysy">Кейсы</Link></li>
                <li><Link href="/#pricing">Тарифы</Link></li>
                <li><Link href="/stat-kurerom" style={{ color: "var(--ew-green)", fontWeight: 700 }}>Стать курьером</Link></li>
              </ul>
            </nav>
            <div className="ew-hbtns">
              <ThemeToggle />
              <a href="tel:+79959199869" className="btn-hdr-icon" aria-label="Позвонить">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              </a>
              <a href="https://t.me/adelivo" target="_blank" rel="noopener noreferrer" className="btn-hdr-icon" aria-label="Telegram">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13L2 9L22 2Z"></path><path d="M22 2L15 22L11 13L2 9L22 2Z"></path></svg>
              </a>
              <Link href="/login" className="btn-hdr-pri">Войти →</Link>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
