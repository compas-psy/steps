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
 * `controller.openQuickAdd(...)`. Не `controller.goTo`: оверлей — не
 * `ScreenId`, см. заголовок `store.ts`, блок про `quickAdd`.
 *
 * Происхождение зависит от того, С КАКОГО экрана нажали, и это не деталь
 * реализации, а таблица `01§3` «Origin → Inherited values»: с Today задача
 * заводится НА СЕГОДНЯ (`origin='today'`), отовсюду ещё — во Входящие без
 * даты (`'global'`: "Global/widget: inbox, no date/project"). Раньше
 * «сегодняшнее» происхождение приносила отдельная кнопка на самом экране
 * Today; в макете (`[R1][M][07]`) такой кнопки нет — добавление живёт в
 * центральной кнопке навигации, поэтому знание о происхождении переехало
 * сюда, а не потерялось вместе с кнопкой.
 *
 * --- Десктоп — отдельная раскладка, а не растянутый телефон ---------------
 *
 * Владелец установил Windows-сборку и вернул её: на 1920px продукт
 * показывал мобильную нижнюю полосу и растянутую на всю ширину колонку.
 * Причина была структурной — оболочка существовала ровно одна, и она
 * БЕЗУСЛОВНО рендерила `BottomNav`. Теперь `AppShell` — развилка:
 *
 *  - `>=1024` (`useIsDesktopViewport`, SPEC/04 §8 «Responsive») —
 *    `DesktopShell`: постоянный сайдбар (`Sidebar`, `@shagi/ui`, §9) слева,
 *    колонка контента ограниченной ширины справа, нижней навигации НЕТ В
 *    DOM (не спрятана — см. заголовок `use-desktop-viewport.ts`);
 *  - `<1024` — прежняя мобильная оболочка без единого изменения: нижняя
 *    навигация на «главных» экранах, остальные экраны как были.
 *
 * Раскладка — по макету `[R1][D][01] Today / Default` (`docs/spec/DESIGN/
 * source_unpacked/ШАГИ - R1 Design.dc.html`, строки 838–872): sidebar 240px
 * тёмной форест-поверхностью, контент с внешними полями и ВНУТРЕННЕЙ
 * колонкой ограниченной ширины (в макете 560px при окне 1240px — то самое
 * «не километровая полоса»). Витринный хром макета (рамка окна, фейковые
 * кружки заголовка) в продукт не переносится — CLAUDE.md.
 *
 * НАБОР ПУНКТОВ САЙДБАРА ШИРЕ, чем у нижней навигации, и это не украшение:
 * §9 перечисляет Сегодня/План/Входящие/Проекты/Фильтры/Метки/Завершённые, а
 * пять пунктов `BottomNav` — вынужденное мобильное ограничение («Входящие»
 * там сознательно не поместились, см. `BottomNav.tsx`). На десктопе этого
 * ограничения нет, поэтому сайдбар даёт все РЕАЛЬНО существующие экраны
 * (Сегодня, План, Входящие, Проекты, Поиск, Завершённые, Настройки) —
 * ровно тот же принцип честности, что и у `BottomNav`: ни одного пункта,
 * за которым ничего нет. «Фильтры»/«Метки» из §9 не показаны — таких
 * экранов в продукте ещё нет.
 *
 * ОБЛАСТЬ ДЕЙСТВИЯ оболочки на десктопе шире, чем `MAIN_TAB_SCREENS`:
 * сайдбар обязан оставаться на месте, когда открыт Inbox, Настройки или
 * карточка задачи — иначе он «мигает» и десктоп снова разваливается на
 * отдельные полноэкранные карточки, как на телефоне. Не покрыт только
 * разовый поток онбординга (`ONBOARDING_SCREENS`): там навигации нет по
 * замыслу — человек ещё не в продукте. На мобильном же множество остаётся
 * прежним (`MAIN_TAB_SCREENS`), чтобы не менять Android-раскладку.
 */
import type { ReactElement, ReactNode } from 'react';

import { t } from '@shagi/i18n';
import {
  BottomNav,
  Button,
  Icon,
  ServiceMark,
  Sidebar,
  type BottomNavItem,
  type SidebarSection,
} from '@shagi/ui';

import { useAppController, useAppState } from '../state/context.js';
import type { AppController, QuickAddOrigin, ScreenId } from '../state/store.js';
import { useIsDesktopViewport } from './use-desktop-viewport.js';
import './AppShell.css';

/** Экраны этого набора получают постоянную нижнюю навигацию — растёт по
 * мере поступления новых «главных» экранов (План/Поиск, E12), тем же
 * приёмом, что уже растёт `ScreenId`/`SCREENS` (не декларируется наперёд
 * списком экранов, которых ещё нет).
 *
 * Множество МОБИЛЬНОЕ: на десктопе состав пунктов другой и шире (см.
 * заголовок файла, блок про десктоп), поэтому оно здесь не переиспользуется
 * — общим у двух раскладок остаётся только `ScreenId`, а не список. */
const MAIN_TAB_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  'todayEmpty',
  'plan',
  'projects',
  'search',
]);

export function isMainTabScreen(screen: ScreenId): boolean {
  return MAIN_TAB_SCREENS.has(screen);
}

/** Разовый поток онбординга (M01–M05) — единственные экраны, которым
 * оболочка не положена НИ НА ОДНОМ вьюпорте: человек ещё не в продукте, ему
 * некуда навигировать. Все остальные экраны на десктопе живут внутри
 * сайдбарной оболочки — см. заголовок файла, блок «ОБЛАСТЬ ДЕЙСТВИЯ». */
const ONBOARDING_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  'launch',
  'welcome',
  'signIn',
  'firstTask',
  'nlpOnboarding',
]);

export function isOnboardingScreen(screen: ScreenId): boolean {
  return ONBOARDING_SCREENS.has(screen);
}

type MainTabValue = 'todayEmpty' | 'plan' | 'projects' | 'search';

/** Порядок — см. заголовок файла, блок «"План"»: `[today, plan]` слева,
 * `[projects, search]` справа от центральной кнопки. */
const NAV_ITEMS: readonly BottomNavItem<MainTabValue>[] = [
  { value: 'todayEmpty', label: t('shell', 'nav.today'), icon: 'calendar' },
  { value: 'plan', label: t('shell', 'nav.plan'), icon: 'list' },
  { value: 'projects', label: t('shell', 'nav.projects'), icon: 'folder' },
  { value: 'search', label: t('shell', 'nav.search'), icon: 'search' },
];

/** Пункты сайдбара — только экраны, которые реально существуют (см.
 * заголовок файла). Две секции, между ними `Divider` рисует сам `Sidebar`:
 * сверху то, куда ходят каждый день, снизу — архивное и настройки, как в
 * макете `[R1][D][01]` («Завершённые» там же, приглушённым). */
const SIDEBAR_SECTIONS: readonly SidebarSection<ScreenId>[] = [
  {
    key: 'daily',
    items: [
      { value: 'todayEmpty', label: t('shell', 'nav.today'), icon: 'calendar' },
      { value: 'plan', label: t('shell', 'nav.plan'), icon: 'list' },
      { value: 'inbox', label: t('shell', 'nav.inbox'), icon: 'inbox' },
      { value: 'projects', label: t('shell', 'nav.projects'), icon: 'folder' },
      { value: 'search', label: t('shell', 'nav.search'), icon: 'search' },
    ],
  },
  {
    key: 'rest',
    items: [
      { value: 'completed', label: t('shell', 'nav.completed'), icon: 'check', muted: true },
      { value: 'settings', label: t('shell', 'nav.settings'), icon: 'settings' },
    ],
  },
];

/** Экран без собственного пункта сайдбара подсвечивает тот раздел, из
 * которого он открыт: карточка проекта — «Проекты», подэкраны настроек —
 * «Настройки». Иначе сайдбар терял бы подсветку целиком, стоило открыть
 * что-нибудь вглубь, и переставал отвечать на вопрос «где я».
 *
 * `taskDetail` сюда НЕ входит осознанно: задачу открывают с Today, из
 * Входящих и из проекта (`store.ts`, блок про `'taskDetail'`) — «откуда»
 * известно только `returnScreen`, и подсвечивать по нему значило бы
 * показывать разный раздел для одного и того же экрана. Ничего не
 * подсвечено — честнее. */
const SIDEBAR_OWNER: Partial<Record<ScreenId, ScreenId>> = {
  projectDetail: 'projects',
  appearance: 'settings',
  dataPrivacy: 'settings',
  importData: 'settings',
  exportData: 'settings',
  legalPrivacyPolicy: 'settings',
  legalUserAgreement: 'settings',
};

/** Происхождение новой задачи по текущему экрану — таблица `01§3` «Origin →
 * Inherited values», общая для обеих раскладок (центральная кнопка
 * `BottomNav` и кнопка «Новая задача» в сайдбаре обязаны вести себя
 * одинаково: раскладка не меняет продуктовое правило). */
function quickAddOriginFor(screen: ScreenId): QuickAddOrigin {
  if (screen === 'todayEmpty') return 'today';
  if (screen === 'inbox') return 'inbox';
  return 'global';
}

/** Переход по пункту навигации. `settings` — через `openSettings()`, а не
 * `goTo('settings')`: этот метод запоминает экран возврата, без него кнопка
 * «Назад» внутри настроек уводила бы не туда, откуда пришли (`store.ts`). */
function navigateTo(controller: AppController, value: ScreenId): void {
  if (value === 'settings') {
    controller.openSettings();
    return;
  }
  controller.goTo(value);
}

function MobileShell({
  screen,
  controller,
  children,
}: {
  readonly screen: ScreenId;
  readonly controller: AppController;
  readonly children: ReactNode;
}): ReactElement {
  // Мобильная оболочка монтируется только для `MAIN_TAB_SCREENS` (см.
  // `AppShell` ниже) — `screen` здесь гарантированно `MainTabValue`, но
  // `ScreenId` шире (растёт под другие экраны), поэтому явный тип не
  // выводится сам.
  const activeValue = screen as MainTabValue;

  return (
    <div className="shagi-app-shell">
      <div className="shagi-app-shell__content">{children}</div>
      <BottomNav
        className="shagi-app-shell__nav"
        label={t('shell', 'nav.label')}
        items={NAV_ITEMS}
        value={activeValue}
        onChange={(value) => controller.goTo(value)}
        centerAction={{
          icon: 'add',
          label: t('shell', 'nav.quickAdd'),
          onClick: () => controller.openQuickAdd(quickAddOriginFor(screen)),
        }}
      />
    </div>
  );
}

function DesktopShell({
  screen,
  controller,
  children,
}: {
  readonly screen: ScreenId;
  readonly controller: AppController;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="shagi-app-shell shagi-app-shell--desktop">
      <Sidebar<ScreenId>
        className="shagi-app-shell__sidebar"
        label={t('shell', 'nav.label')}
        sections={SIDEBAR_SECTIONS}
        value={SIDEBAR_OWNER[screen] ?? screen}
        onChange={(value) => navigateTo(controller, value)}
        header={
          <div className="shagi-app-shell__brand">
            <div className="shagi-app-shell__brand-row">
              <ServiceMark size={26} />
              <span className="shagi-app-shell__brand-name">
                {t('shell', 'sidebar.productName')}
              </span>
            </div>
            {/* Замена центральной кнопки `BottomNav`: на десктопе нижней
             * полосы нет, а способ завести задачу мышью обязан остаться
             * видимым — `Ctrl+N` (`App.tsx`) сам себя не показывает.
             * Подпись с сочетанием клавиш рядом — она же и учит. */}
            <Button
              variant="primary"
              block
              leadingIcon={<Icon name="add" size={18} />}
              onClick={() => controller.openQuickAdd(quickAddOriginFor(screen))}
            >
              {t('shell', 'sidebar.quickAdd')}
            </Button>
            <span className="shagi-app-shell__shortcut">
              {t('shell', 'sidebar.quickAddShortcut')}
            </span>
          </div>
        }
      />
      <main className="shagi-app-shell__main">
        <div className="shagi-app-shell__column">{children}</div>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const { screen } = useAppState();
  const controller = useAppController();
  const desktop = useIsDesktopViewport();

  // Онбординг — во весь экран на любой ширине (см. `ONBOARDING_SCREENS`).
  if (isOnboardingScreen(screen)) return <>{children}</>;

  if (desktop) {
    return (
      <DesktopShell screen={screen} controller={controller}>
        {children}
      </DesktopShell>
    );
  }

  // Мобильная раскладка — ровно как была: нижняя навигация только на
  // «главных» экранах, остальные экраны рендерятся голыми (Inbox и
  // настройки — карточки со своей кнопкой «Назад», не вкладки).
  if (!isMainTabScreen(screen)) return <>{children}</>;

  return (
    <MobileShell screen={screen} controller={controller}>
      {children}
    </MobileShell>
  );
}
