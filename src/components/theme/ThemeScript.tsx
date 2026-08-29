// src/components/theme/ThemeScript.tsx
// Серверный компонент. Ставит data-ew-theme на <html> ДО первой отрисовки,
// поэтому светлая тема не «мигает» тёмной при загрузке.
// Порядок выбора: 1) сохранённый выбор пользователя, 2) системная настройка, 3) тёмная.

import { THEME_CSS } from "./theme";

const BOOT = `(function(){
  try{
    var s = localStorage.getItem('ew-theme');
    var t = (s === 'light' || s === 'dark')
      ? s
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-ew-theme', t);
  }catch(e){
    document.documentElement.setAttribute('data-ew-theme','dark');
  }
})();`;

export function ThemeScript() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
    </>
  );
}
