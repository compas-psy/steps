/**
 * A11y-скан каталога-харнесса `@shagi/ui` (E03 «харнесс a11y и
 * визрегрессии», `docs/spec/SPEC/06_TESTING_ACCEPTANCE.md` §7 — «Automated
 * axe + manual keyboard + TalkBack + NVDA … 200% zoom, reduced motion,
 * dark/light contrast»). Эта проверка закрывает автоматическую половину
 * («Automated axe … dark/light») — клавиатура/TalkBack/NVDA/200%-zoom
 * остаются вне охвата Playwright по своей природе (реальный экранный
 * диктор/ручное увеличение), не автоматизируются этим файлом.
 *
 * `withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])` — только правила,
 * реально привязанные к успешным критериям WCAG 2.2 AA (задание
 * оркестратора); best-practice-правила axe (`region`, `landmark-unique` и
 * т.п. — не в этих тегах) сознательно не включены: они ловят стилистические
 * отклонения, не приёмочный критерий.
 *
 * Тема переключается через `?theme=` (см. `../dev/Harness.tsx`) — так тест
 * не полагается на `page.evaluate` для смены `data-theme` до первого рендера
 * компонентов (иначе часть DOM успела бы отрисоваться в системной теме до
 * переключения, и скан снял бы смешанное состояние).
 */
import { AxeBuilder } from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

interface FormattedViolation {
  readonly id: string;
  readonly impact: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly nodes: readonly string[];
}

/** Разворачивает нарушения axe в текст, который сразу называет правило,
 * компонент (через селектор узла) и `helpUrl` — без этого падение теста
 * говорило бы только «есть нарушения», не «какие именно» (задание
 * оркестратора: «вывод нарушений — в сообщение ошибки, не просто toBe(0)»). */
function formatViolations(violations: readonly FormattedViolation[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => `      - ${node}`).join('\n');
      return (
        `  [${violation.impact}] ${violation.id} — ${violation.help}\n` +
        `    ${violation.helpUrl}\n${targets}`
      );
    })
    .join('\n\n');
}

async function scanTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.goto(`/?theme=${theme}`);
  await expect(page.getByTestId('harness-root')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const formatted: FormattedViolation[] = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? 'unknown',
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }));

  expect(
    formatted,
    formatted.length > 0
      ? `axe нашёл ${formatted.length} нарушени${formatted.length === 1 ? 'е' : 'й'} WCAG 2.2 AA ` +
          `(тема ${theme}):\n\n${formatViolations(formatted)}`
      : undefined,
  ).toEqual([]);
}

test('харнесс без нарушений WCAG 2.2 AA — светлая тема', async ({ page }) => {
  await scanTheme(page, 'light');
});

test('харнесс без нарушений WCAG 2.2 AA — тёмная тема', async ({ page }) => {
  await scanTheme(page, 'dark');
});
