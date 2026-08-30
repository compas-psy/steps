import { describe, expect, it } from 'vitest';

import { readBundledCss } from './cssHelpers.js';

/**
 * Отсутствие витринных тем (задание, «Важный контекст»): `paper` /
 * `graphite` / `ink` — витрина сравнения тем семейства ЗАПИСКИ из
 * HTML-прототипа, а не темы ШАГОВ. Продукт поставляет System / Light /
 * Dark и только их — `packages/ui` не должен физически содержать ни
 * токенов, ни селекторов этих трёх тем.
 *
 * Проверяем конкретно attribute-селекторы `[data-theme="paper"]` и т.п.
 * (а не голое `.includes('ink')`, потому что `ink-900`/`ink-500` —
 * легитимные токены ШАГИ, содержащие подстроку «ink»; ложное
 * срабатывание тут было бы хуже, чем полезная проверка).
 */

const bundledCss = readBundledCss();

const SHOWCASE_THEMES = ['paper', 'graphite', 'ink'] as const;

describe('витринные темы ЗАПИСОК отсутствуют в собранном CSS', () => {
  it.each(SHOWCASE_THEMES)('нет селектора [data-theme=%s]', (theme) => {
    expect(bundledCss).not.toContain(`[data-theme="${theme}"]`);
    expect(bundledCss).not.toContain(`[data-theme='${theme}']`);
  });

  it('в CSS встречаются только продуктовые значения data-theme — "dark" и защитный :not([data-theme=\'light\'])', () => {
    // "light" легитимно встречается только внутри guard-селектора
    // `:root:not([data-theme='light'])` — явный выбор Light обязан
    // побеждать системную тёмную настройку (см. colors.css). Сам Light
    // как тема не имеет атрибута — это голый `:root`.
    const matches = [...bundledCss.matchAll(/\[data-theme=(['"])([^'"]+)\1\]/g)].map((m) => m[2]);
    expect(new Set(matches)).toEqual(new Set(['dark', 'light']));
  });
});
