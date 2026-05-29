"use client";
import { useState } from "react";

// Фиктивные координаты для теста кнопок
const STORE_COORDS = "55.749511,37.596205";

export default function DesignSandboxPage() {
  // === ПАНЕЛЬ УПРАВЛЕНИЯ СОСТОЯНИЯМИ (Control Panel) ===
  const [isAccepted, setIsAccepted] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isAllDelivered, setIsAllDelivered] = useState(false);
  const [hasPlannedTime, setHasPlannedTime] = useState(true);
  const [hasPickedUpTime, setHasPickedUpTime] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // === МОКОВЫЕ ДАННЫЕ ===
  const total = 5;
  const delivered = isAllDelivered ? 5 : (isStarted ? 2 : 0);
  const routePriceTotal = 4500;
  
  const routeObj = {
    name: "Юг (Тестовый)",
    link: "https://yandex.ru/maps",
    plannedDepartureTime: hasPlannedTime ? "14:30" : null,
    departureAdvice: !hasPlannedTime ? "до 15:00" : null,
    baseArrivalTime: "",
    estimatedReturnTime: "18:45",
  };

  const advice = routeObj.plannedDepartureTime 
    ? `Забрать в ${routeObj.plannedDepartureTime}` 
    : (routeObj.departureAdvice ?? null);

  const pickedUpTimeStr = hasPickedUpTime ? "14:28" : null;
  const routeUrl = "https://yandex.ru/maps";
  const toBaseUrl = "https://yandex.ru/maps";

  return (
    <div style={{ padding: 20, background: "#eef3ff", minHeight: "100vh", fontFamily: "sans-serif" }}>
      
      {/* 🛠 ПАНЕЛЬ УПРАВЛЕНИЯ (Только для разработчика) */}
      <div style={{ background: "#1a1a18", padding: 20, borderRadius: 12, color: "#fff", marginBottom: 30, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "#facc15" }}>🛠 UI Sandbox (Панель управления)</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "#333", padding: "6px 12px", borderRadius: 8 }}>
            <input type="checkbox" checked={isAccepted} onChange={e => setIsAccepted(e.target.checked)} />
            Маршрут принят
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "#333", padding: "6px 12px", borderRadius: 8 }}>
            <input type="checkbox" checked={hasPlannedTime} onChange={e => setHasPlannedTime(e.target.checked)} />
            Есть точное время выезда
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "#333", padding: "6px 12px", borderRadius: 8 }}>
            <input type="checkbox" checked={hasPickedUpTime} onChange={e => setHasPickedUpTime(e.target.checked)} />
            Зеленая галка (Выехал)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "#333", padding: "6px 12px", borderRadius: 8 }}>
            <input type="checkbox" checked={isStarted} onChange={e => setIsStarted(e.target.checked)} />
            В процессе доставки
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "#333", padding: "6px 12px", borderRadius: 8 }}>
            <input type="checkbox" checked={isAllDelivered} onChange={e => { setIsAllDelivered(e.target.checked); if(e.target.checked) setIsStarted(true); }} />
            Всё доставлено
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "#333", padding: "6px 12px", borderRadius: 8 }}>
            <input type="checkbox" checked={isExpanded} onChange={e => setIsExpanded(e.target.checked)} />
            Развернут
          </label>
        </div>
      </div>

      {/* 📱 ЭМУЛЯЦИЯ ЭКРАНА ТЕЛЕФОНА */}
      <div style={{ maxWidth: 480, margin: "0 auto", background: "#f5f4f0", border: "8px solid #1a1a18", borderRadius: 32, overflow: "hidden", height: 700, display: "flex", flexDirection: "column" }}>
        
        {/* Фейковая шапка */}
        <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #e8e6df", position: "sticky", top: 0, zIndex: 10 }}>
          <h1 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Мои маршруты</h1>
          <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>На сегодня: 5 точек</div>
        </div>

        {/* Скроллируемая область */}
        <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
          
          {/* 👇 ТЕСТИРУЕМЫЙ КОМПОНЕНТ КАРТОЧКИ 👇 */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
            <div style={{ padding: "14px 16px", background: "#fafaf8", borderBottom: isExpanded ? "1px solid #e8e6df" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", cursor: "pointer", marginBottom: isExpanded ? 12 : 0 }} onClick={() => setIsExpanded(!isExpanded)}>
                
                {/* ЛЕВАЯ ЧАСТЬ */}
                <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a18", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    Маршрут {routeObj.name}
                    
                    {!isAccepted && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsAccepted(true); }}
                        style={{ fontSize: 10, background: "#facc15", color: "#78350f", padding: "4px 8px", borderRadius: 6, fontWeight: 800, textTransform: "uppercase", border: "none", cursor: "pointer", boxShadow: "0 2px 4px rgba(250,204,21,0.3)" }}
                      >
                        Принять маршрут
                      </button>
                    )}
                  </div>
                  
                  <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>
                    {delivered}/{total} доставлено • <span style={{ fontWeight: 600, color: "#6b6860" }}>{routePriceTotal} ₽</span>
                  </div>
                  
                  {pickedUpTimeStr ? (
                    <div style={{ marginTop: 8, padding: "4px 8px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 6, display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 12 }}>✅</span>
                      <div style={{ fontSize: 11, color: "#065f46", fontWeight: 700 }}>Забрал с базы в {pickedUpTimeStr}</div>
                    </div>
                  ) : advice ? (
                    <div style={{ marginTop: 8, padding: "4px 8px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 12 }}>⏰</span>
                      <div style={{ fontSize: 11, color: "#78350f", fontWeight: 700 }}>{advice}</div>
                    </div>
                  ) : null}
                </div>

                {/* ПРАВАЯ ЧАСТЬ */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", flexShrink: 0, minHeight: "100%" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {!isAllDelivered && (
                      <div style={{ fontSize: 12, background: "#facc15", color: "#1a1a18", padding: "6px 12px", borderRadius: 8, fontWeight: 800 }}>📍 Маршрут</div>
                    )}
                    {isAllDelivered && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <div style={{ fontSize: 12, background: "#e8e6df", color: "#1a1a18", padding: "6px 12px", borderRadius: 8, fontWeight: 800 }}>🏠 На базу</div>
                        <span style={{ fontSize: 10, color: "#a8a49c", fontWeight: 600 }}>к {routeObj.estimatedReturnTime}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 18, color: "#1a1a18", fontWeight: 900, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", marginTop: "auto", paddingTop: 10 }}>▼</div>
                </div>
              </div>

              {isExpanded && isAccepted && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px dashed #e8e6df", paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "#a8a49c", fontWeight: 600 }}>На базе в:</span>
                      <select style={{ border: "1px solid #e8e6df", borderRadius: 6, padding: "4px 8px", fontSize: 13, fontWeight: 600, color: "#1a1a18", background: "#fff", outline: "none", cursor: "pointer" }}>
                        <option value="">14:30</option>
                      </select>
                    </div>
                    <button style={{ background: "#4a7aff", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, boxShadow: "0 2px 6px rgba(74, 122, 255, 0.25)" }}>🚀 Забрал все</button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Фейковые заказы для вида */}
            {isExpanded && (
               <div style={{ padding: 16, textAlign: "center", color: "#a8a49c", fontSize: 13, background: "#fafaf8" }}>
                  [ Здесь рендерятся заказы ]<br/>
                  Переключай состояния в панели сверху! 👆
               </div>
            )}
          </div>
          {/* 👆 КОНЕЦ ТЕСТИРУЕМОГО КОМПОНЕНТА 👆 */}

        </div>
      </div>
    </div>
  );
}