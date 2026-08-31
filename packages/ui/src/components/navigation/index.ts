/**
 * Барель навигационных компонентов `@shagi/ui` (E03.2 «навигация», см.
 * `.ultraplan/research/02-ui.md` §2 «Навигация» и `04_UI_DESIGN_SYSTEM.md`
 * §9/§10). Территория этого пакета работ — сам подкаталог
 * `src/components/navigation/`; интеграция в публичный барель компонентов
 * (`../index.ts`) и в точку входа пакета (`../../index.ts`) — отдельная
 * задача сведения при приёмке (см. отчёт пакета работ), не изменяется
 * здесь тем же приёмом, что `src/icons/index.ts` (E03.0) остаётся
 * не подключённым в `../index.ts` пакета до своей интеграции.
 */
export { Breadcrumb, type BreadcrumbItem, type BreadcrumbProps } from './Breadcrumb.js';
export {
  BottomNav,
  type BottomNavCenterAction,
  type BottomNavItem,
  type BottomNavProps,
} from './BottomNav.js';
export {
  CommandPalette,
  type CommandPaletteItem,
  type CommandPaletteProps,
} from './CommandPalette.js';
export { Sidebar, type SidebarItem, type SidebarProps, type SidebarSection } from './Sidebar.js';
export { Tabs, type TabItem, type TabsProps } from './Tabs.js';
export { TopBar, type TopBarProps } from './TopBar.js';
