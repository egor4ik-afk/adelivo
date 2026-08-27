// src/components/layout/AppFooter.tsx
import Link from "next/link";

const C = {
  bg: "#080C14",
  border:  "rgba(56,189,248,0.12)",
  accent:  "#38BDF8",
  text:    "#E2EBF8",
  muted:   "#64748B",
};

const css = `
  .ftr{border-top:1px solid ${C.border};background:${C.bg};padding:3.5rem 0 2.5rem}
  .ftr .wrap{max-width:1160px;margin:0 auto;padding:0 1.5rem}
  .ftr-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:2rem}
  .ftr-logo-txt{font-weight:800;font-size:1.1rem;color:${C.text};letter-spacing:0.05em; margin-bottom: 0.9rem;}
  .ftr-logo-txt span{color:${C.accent}}
  .ftr-h{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.14em;color:${C.accent};font-weight:700;margin-bottom:0.9rem}
  .ftr-l{display:block;font-size:0.82rem;color:${C.muted};margin-bottom:0.55rem;transition:color .2s}
  .ftr-l:hover{color:${C.text}}
  .ftr-bottom{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid ${C.border};display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:0.76rem;color:${C.muted}}

  @media(max-width:900px){
    .ftr-grid{grid-template-columns:1fr 1fr}
  }
`;

export function AppFooter() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <footer className="ftr">
        <div className="wrap">
          <div className="ftr-grid">
            <div>
              <div className="ftr-logo-txt">Agent<span>Delivo</span></div>
              <p style={{ fontSize: "0.82rem", color: C.muted, lineHeight: 1.75, maxWidth: 300 }}>
                Универсальная платформа диспетчеризации для любой доставки: заказы, маршруты,
                курьеры, выплаты и бухгалтерия в одном окне. Подключение к любой CRM — бесплатно за 3 дня.
              </p>
            </div>
            <div>
              <p className="ftr-h">Платформа</p>
              <Link className="ftr-l" href="/sistema-upravleniya-kurerami">Система управления курьерами</Link>
              <Link className="ftr-l" href="/vozmozhnosti/zakazy">Заказы и диспетчеризация</Link>
              <Link className="ftr-l" href="/vozmozhnosti/kurery">Курьеры, выплаты, график</Link>
              <Link className="ftr-l" href="/vozmozhnosti/interfeysy">Три интерфейса</Link>
              <Link className="ftr-l" href="/ai-marshrutizaciya">AI-маршрутизация</Link>
            </div>
            <div>
              <p className="ftr-h">Интеграции</p>
              <Link className="ftr-l" href="/integracii">Все интеграции</Link>
              <Link className="ftr-l" href="/integracii/bitrix24">Битрикс24</Link>
              <Link className="ftr-l" href="/integracii/retailcrm">RetailCRM</Link>
              <Link className="ftr-l" href="/integracii/telegram">Telegram</Link>
              <Link className="ftr-l" href="/integracii/yandex-karty">Яндекс Карты</Link>
              <Link className="ftr-l" href="/integracii/konsol-pro">Консоль.Про</Link>
            </div>
            <div>
              <p className="ftr-h">Компания</p>
              <Link className="ftr-l" href="/about">О компании</Link>
              <Link className="ftr-l" href="/pochemu-my">Почему мы</Link>
              <Link className="ftr-l" href="/keysy">Кейсы</Link>
              <Link className="ftr-l" href="/keysy/bunch">Кейс: «Банч»</Link>
              <Link className="ftr-l" href="/#pricing">Тарифы</Link>
              <a className="ftr-l" href="https://t.me/adelivo" target="_blank" rel="noopener noreferrer">Telegram</a>
              <a href="tel:+79959199869" className="ftr-l">+79959199869</a>
              <Link className="ftr-l" href="/design">Дизайн</Link>
            </div>
          </div>
          <div className="ftr-bottom">
            <span>© {new Date().getFullYear()} ADelivo — платформа диспетчеризации и логистики</span>
            <span>Работаем с СЗ, ИП и ГПХ через Консоль.Про</span>
          </div>
        </div>
      </footer>
    </>
  );
}
