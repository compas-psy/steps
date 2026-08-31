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
 * пяти сегодня реализовано два (Today, Projects) — «План» и «Поиск» ждут
 * своих эпиков (E12), центральная кнопка «Быстрое добавление» — своего
 * (E05, UI Quick Add сознательно не построен ни в одном пакете работ,
 * см. историю `.ultraplan/plan.md`). Компонент не притворяется, что этих
 * возможностей больше, чем есть: `items` — только два реальных пункта (не
 * пять с тремя недостижимыми), центральная кнопка — честно `disabled` с
 * причиной в подписи, не скрыта и не изображает рабочей.
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
const MAIN_TAB_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['todayEmpty', 'projects']);

export function isMainTabScreen(screen: ScreenId): boolean {
  return MAIN_TAB_SCREENS.has(screen);
}

type MainTabValue = 'todayEmpty' | 'projects';

const NAV_ITEMS: readonly BottomNavItem<MainTabValue>[] = [
  { value: 'todayEmpty', label: t('shell', 'bottomNav.today'), icon: 'calendar' },
  { value: 'projects', label: t('shell', 'bottomNav.projects'), icon: 'folder' },
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
