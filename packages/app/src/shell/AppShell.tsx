/**
 * `AppShell` — постоянная нижняя навигация вокруг «главных» экранов
 * приложения (M16 «Projects», M06/M07 «Today» — `12_SCREEN_STATE_MATRIX.md`).
 * Эпик E09, точка, где у продукта впервые появляется ВТОРОЙ равноправный
 * «главный» экран (`Today` и `Projects` — оба места, куда пользователь
 * возвращается, не шаг одноразового потока онбординга) — до этого пакета
 * работ обёртки не было, `Screens` в `App.tsx` просто рендерил текущий
 * экран как есть.
 *
 * `.ultraplan/research/02-ui.md` §4 / `04_UI_DESIGN_SYSTEM.md`: «Bottom
 * nav, 5 позиций: Сегодня · План · (+ по центру) · Проекты · Поиск» — это
 * продуктовое решение формы `BottomNav` (`@shagi/ui`, уже фиксирует ровно
 * такую структуру: боковые пункты вокруг одной центральной кнопки). Из
 * пяти сегодня реализовано четыре (Today, Plan — пакет работ E12.2, Projects,
 * Search — пакет работ E12.1) — центральная кнопка «Быстрое добавление»
 * ждёт своего пакета работ (E05, UI Quick Add сознательно не построен ни в
 * одном пакете работ, см. историю `.ultraplan/plan.md`). Компонент не
 * притворяется, что этих возможностей больше, чем есть: `items` — только
 * четыре реальных пункта (не пять с одним недостижимым), центральная
 * кнопка — честно `disabled` с причиной в подписи, не скрыта и не
 * изображает рабочей.
 *
 * «Поиск» (M34/M35, эпик E12.1) — обычный пункт `items`, не оверлей: клик
 * → `controller.goTo('search')` (`state/store.ts`, блок про `'search'` в
 * заголовке файла) — тот же путь, что уже есть у «Проекты», Search тоже
 * «главный» экран, на который возвращаются, не шаг разового потока.
 *
 * «План» (M14/M15, эпик E12.2) — тот же приём, что «Поиск» выше: обычный
 * пункт `items`, клик → `controller.goTo('plan')` (`state/store.ts`, блок
 * про `'plan'`). Порядок `NAV_ITEMS` — `[today, plan, projects, search]`,
 * ровно как в цитате `02-ui.md` выше («Сегодня · План · + · Проекты ·
 * Поиск»): `BottomNav` делит `items` пополам вокруг центральной кнопки
 * (`Math.ceil(items.length / 2)` — см. `BottomNav.tsx`), при четырёх
 * пунктах это `[today, plan]` слева и `[projects, search]` справа —
 * визуально ровно требуемый порядок без отдельного пропа очерёдности.
 *
 * «Входящие» НЕ входит в `items` — уже задокументированное дизайн-решение
 * (см. `BottomNav.tsx`, заголовок: «Вход во Входящие сюда не включён…
 * бейдж-счётчик на Today-header»), `Inbox.tsx` уже реализует этот путь
 * (эпик E07) и остаётся вне `AppShell` — экран-карточка с собственной
 * кнопкой «Назад», не равноправная вкладка (в отличие от Today/Projects,
 * возврат с Inbox всегда идёт на Today, не «куда угодно»).
 *
 * Центральная кнопка «Быстрое добавление» была честно `disabled` до пакета
 * работ E05.2 (UI Quick Add не существовал) — теперь открывает оверлей
 * `controller.openQuickAdd('global')` (`state/store.ts`, `origin='global'`
 * → `01§3`: "Global/widget: inbox, no date/project"). Не `controller.goTo`:
 * оверлей — не `ScreenId`, см. заголовок `store.ts`, блок про `quickAdd`.
 */
import type { ReactElement, ReactNode } from 'react';

import { t } from '@shagi/i18n';
import { BottomNav, type BottomNavItem } from '@shagi/ui';

import { useAppController, useAppState } from '../state/context.js';
import type { ScreenId } from '../state/store.js';

/** Экраны этого набора получают постоянную нижнюю навигацию — растёт по
 * мере поступления новых «главных» экранов (План/Поиск, E12), тем же
 * приёмом, что уже растёт `ScreenId`/`SCREENS` (не декларируется наперёд
 * списком экранов, которых ещё нет). */
const MAIN_TAB_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  'todayEmpty',
  'plan',
  'projects',
  'search',
]);

export function isMainTabScreen(screen: ScreenId): boolean {
  return MAIN_TAB_SCREENS.has(screen);
}

type MainTabValue = 'todayEmpty' | 'plan' | 'projects' | 'search';

/** Порядок — см. заголовок файла, блок «"План"»: `[today, plan]` слева,
 * `[projects, search]` справа от центральной кнопки. */
const NAV_ITEMS: readonly BottomNavItem<MainTabValue>[] = [
  { value: 'todayEmpty', label: t('shell', 'bottomNav.today'), icon: 'calendar' },
  { value: 'plan', label: t('shell', 'bottomNav.plan'), icon: 'list' },
  { value: 'projects', label: t('shell', 'bottomNav.projects'), icon: 'folder' },
  { value: 'search', label: t('shell', 'bottomNav.search'), icon: 'search' },
];

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const { screen } = useAppState();
  const controller = useAppController();

  // `AppShell` монтируется только для экранов из `MAIN_TAB_SCREENS` (см.
  // `App.tsx`) — `screen` здесь гарантированно `MainTabValue`, но `ScreenId`
  // шире (растёт под другие экраны), поэтому явный тип не выводится сам.
  const activeValue = screen as MainTabValue;

  return (
    <div>
      <div>{children}</div>
      <BottomNav
        label={t('shell', 'bottomNav.label')}
        items={NAV_ITEMS}
        value={activeValue}
        onChange={(value) => controller.goTo(value)}
        centerAction={{
          icon: 'add',
          label: t('shell', 'bottomNav.quickAdd'),
          onClick: () => controller.openQuickAdd('global'),
        }}
      />
    </div>
  );
}
