// src/components/layout/navItems.ts
// Единый список разделов приложения.
//
// Раньше навигация была описана дважды: горизонтальная в AppTopBar и
// бургер в AppMenu, с разным составом пунктов. В бургере были «Заказы» и
// «Доступы», в шапке их не было; в шапке был «Дашборд», в бургере нет.
// Из-за этого меню отличалось от страницы к странице. Теперь список один,
// а компоненты только по-разному его рисуют.

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  hint?: string;
  /** Роли, которым пункт виден. */
  roles: string[];
  /** Только для глобального администратора. */
  superOnly?: boolean;
  /** Показывать в компактном (бургерном) меню, но не в горизонтальной шапке. */
  secondary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  // Роли выставлены по тому, куда человека реально пускает страница.
  // Раньше «Дашборд», «Курьеры» и «Заказы» были помечены как доступные
  // оператору, хотя все три редиректят OPERATOR обратно на /manager:
  // в меню менеджера висели три ссылки, ведущие на ту же страницу.
  { href: "/dashboard", label: "Дашборд", icon: "🗺", hint: "Карта и распределение заказов", roles: ["ADMIN"] },
  { href: "/manager", label: "Менеджер", icon: "📋", hint: "Маршруты и изменения", roles: ["ADMIN", "OPERATOR"] },
  { href: "/couriers", label: "Курьеры", icon: "🚚", hint: "Смены, выплаты, геолокация", roles: ["ADMIN"] },
  { href: "/schedule", label: "График", icon: "📅", hint: "Смены сотрудников и курьеров", roles: ["ADMIN", "OPERATOR"] },
  { href: "/company", label: "Компания", icon: "🏢", hint: "Магазины, подключения, Telegram", roles: ["ADMIN"] },
  { href: "/admin", label: "Пользователи", icon: "👥", hint: "Роли сотрудников", roles: ["ADMIN"] },
  { href: "/admin/access", label: "Доступы", icon: "🔑", hint: "Кто какие магазины видит", roles: ["ADMIN"] },

  // Второстепенное: в шапке заняло бы место, в бургере пусть будет
  // «Заказы» доступны и менеджеру: страница списка не админская, там
  // те же заказы, что он ведёт в своём кабинете, только таблицей.
  { href: "/orders", label: "Заказы", icon: "≡", hint: "Все заказы списком", roles: ["ADMIN", "OPERATOR"] },
  { href: "/manager/orders/new", label: "Создать заказ", icon: "＋", hint: "Вручную или вставкой текста", roles: ["ADMIN", "OPERATOR"], secondary: true },

  // Курьерские экраны
  { href: "/courier/routes", label: "Мои маршруты", icon: "🧭", roles: ["COURIER"] },
  { href: "/courier/points", label: "Карта", icon: "📍", roles: ["COURIER"] },
];

/** Пункты, доступные конкретному человеку. */
export function navFor(role: string, isSuperAdmin = false): NavItem[] {
  return NAV_ITEMS.filter((n) => {
    if (n.superOnly && !isSuperAdmin) return false;
    // Глобальный админ получает всё, что доступно админу, но не курьерские
    // экраны: раньше условие `|| isSuperAdmin` пускало в меню «Мои маршруты»
    // и «Карту», хотя ни того, ни другого у него нет.
    if (isSuperAdmin) return n.roles.includes("ADMIN");
    return n.roles.includes(role);
  });
}

/**
 * Активен ли пункт для текущего пути.
 * Точное совпадение или вложенный путь — но не «/admin» на «/admin/access»,
 * иначе подсвечивались бы сразу два пункта.
 */
export function isActiveNav(item: NavItem, pathname: string, all: NavItem[]): boolean {
  if (pathname === item.href) return true;
  if (!pathname.startsWith(item.href + "/")) return false;
  // Есть более длинный пункт, который подходит лучше — уступаем ему
  return !all.some((o) => o !== item && o.href.length > item.href.length && pathname.startsWith(o.href));
}