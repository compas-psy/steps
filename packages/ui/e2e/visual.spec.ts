/**
 * Визрегрессия каталога-харнесса `@shagi/ui` (E03 «харнесс a11y и
 * визрегрессии», `00_MASTER_IMPLEMENTATION_TZ.md` — «Playwright — Web E2E +
 * visual regression»).
 *
 * Гранулярность — по каждой СЕКЦИИ харнесса (`data-testid="section-*"`,
 * `../dev/sections/*.tsx`), не одним скриншотом всей страницы и не по
 * каждому из 65+ отдельных примеров: секция уже даёт точечный diff (какая
 * категория компонентов сломалась — Primitives/Navigation/Overlay/…), а
 * 8 файлов на тему (16 всего) — управляемый по объёму, реально просматриваемый
 * при код-ревью baseline, в отличие от 130+ файлов при пер-примерной
 * гранулярности (65 примеров × 2 темы). `data-testid` у каждого отдельного
 * примера (`example-*`) при этом всё равно расставлен в разметке — он
 * остаётся точным Playwright-локатором для точечной проверки/дебага
 * конкретного компонента вручную, просто не как отдельный `toHaveScreenshot`
 * файл по умолчанию.
 *
 * Детерминизм — оба приёма из задания оркестратора сразу, не один вместо
 * другого:
 * 1. `page.emulateMedia({ reducedMotion: 'reduce' })` — семантически верный
 *    способ (компоненты уже читают `prefers-reduced-motion` через
 *    `--motion-*` токены/`@media`-блоки, см. `../src/tokens/motion.css»),
 *    именно то окружение, которое реально увидит пользователь с этой
 *    настройкой ОС.
 * 2. Инъекция `* { animation: none !important; transition: none !important; }`
 *    поверх — потому что `prefers-reduced-motion` НЕ гарантирует полную
 *    остановку: `Spinner.css`/`SyncState.css` показывают два разных ответа
 *    на reduced-motion у одного и того же паттерна «бесконечное вращение» —
 *    `SyncState` останавливает анимацию совсем (`animation: none`), а
 *    `Spinner` только замедляет её (`animation-duration` увеличивается, вращение
 *    не останавливается) — второй случай всё ещё недетерминирован между
 *    прогонами без явного `!important`-оverride.
 *
 * Viewport и тема — `playwright.config.ts` (`use.viewport`) и `?theme=`
 * (`../dev/Harness.tsx`), не `page.setViewportSize`/`page.evaluate` здесь.
 */
import { type Page, expect, test } from '@playwright/test';

const SECTION_TEST_IDS = [
  'section-primitives',
  'section-navigation',
  'section-overlay',
  'section-feedback',
  'section-task',
  'section-planning',
  'section-organization',
  'section-capture',
] as const;

const THEMES = ['light', 'dark'] as const;

const FREEZE_MOTION_CSS = '* { animation: none !important; transition: none !important; }';

async function openHarness(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?theme=${theme}`);
  await expect(page.getByTestId('harness-root')).toBeVisible();
  await page.addStyleTag({ content: FREEZE_MOTION_CSS });
}

for (const theme of THEMES) {
  test.describe(`визрегрессия — тема ${theme}`, () => {
    for (const sectionTestId of SECTION_TEST_IDS) {
      test(`${sectionTestId}`, async ({ page }) => {
        await openHarness(page, theme);
        const section = page.getByTestId(sectionTestId);
        await section.scrollIntoViewIfNeeded();
        await expect(section).toHaveScreenshot(`${sectionTestId}-${theme}.png`);
      });
    }
  });
}
