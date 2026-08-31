/**
 * Каталог-харнесс `@shagi/ui` (E03 «харнесс a11y и визрегрессии»,
 * `docs/spec/SPEC/06_TESTING_ACCEPTANCE.md` §7). Не экран продукта и не
 * часть публичного API пакета (`../src/index.ts`) — internal-инструмент
 * `dev/`, см. заголовок `main.tsx`/`vite.config.ts`.
 *
 * Монтирует по одному представительному примеру на каждое задокументированное
 * состояние всех 65 компонентов `../src/components/index.ts` (16 Primitives +
 * 6 Navigation + 5 Overlay + 7 Feedback + 8 Task + 9 Planning + 8 Organization
 * + 6 Capture — секции ниже), сгруппированных секциями с `<h2>` и
 * `data-testid` на каждой секции/примере (точечные Playwright-локаторы —
 * `e2e/a11y.spec.ts`/`e2e/visual.spec.ts`).
 *
 * Переключатель темы наверху страницы переключает
 * `document.documentElement.dataset.theme` между `'light'`/`'dark'`/System
 * (атрибут снят) — тот же механизм, что уже есть в `../src/tokens/colors.css`
 * (`[data-theme='dark']`/`:root:not([data-theme='light'])`). Начальное
 * значение читается из query-параметра `?theme=` (`main.tsx`) — так
 * Playwright может открыть страницу сразу в нужной теме через URL, не
 * дожидаясь клика по переключателю и не гоняя лишний `page.evaluate`.
 */
import { type ReactElement, useEffect, useState } from 'react';

import { CaptureSection } from './sections/Capture.js';
import { FeedbackSection } from './sections/Feedback.js';
import { NavigationSection } from './sections/Navigation.js';
import { OrganizationSection } from './sections/Organization.js';
import { OverlaySection } from './sections/Overlay.js';
import { PlanningSection } from './sections/Planning.js';
import { PrimitivesSection } from './sections/Primitives.js';
import { TaskSection } from './sections/Task.js';

export type HarnessTheme = 'light' | 'dark' | 'system';

const THEME_OPTIONS: readonly { readonly value: HarnessTheme; readonly label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function isHarnessTheme(value: string | null): value is HarnessTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Читает `?theme=` один раз при первом рендере — см. заголовок файла. */
function initialTheme(): HarnessTheme {
  if (typeof window === 'undefined') return 'system';
  const fromQuery = new URLSearchParams(window.location.search).get('theme');
  return isHarnessTheme(fromQuery) ? fromQuery : 'system';
}

export function Harness(): ReactElement {
  const [theme, setTheme] = useState<HarnessTheme>(initialTheme);

  useEffect(() => {
    if (theme === 'system') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  return (
    <>
      <header className="dev-header">
        <h1 className="dev-header__title">@shagi/ui — харнесс дизайн-системы</h1>
        <div className="dev-theme-switch" role="group" aria-label="Тема">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={theme === option.value}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>
      <main className="dev-page" data-testid="harness-root">
        <PrimitivesSection />
        <NavigationSection />
        <OverlaySection />
        <FeedbackSection />
        <TaskSection />
        <PlanningSection />
        <OrganizationSection />
        <CaptureSection />
      </main>
    </>
  );
}
