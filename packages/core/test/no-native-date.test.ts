import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { listSourceFiles } from '../src/internal/list-source-files.js';

/**
 * `00 §5`: нативный `Date` запрещён в доменной логике — только `Temporal`.
 *
 * Это правило сделано наблюдаемым как тест, а не как правило линтера:
 * `oxlint` в этой версии монорепозитория не имеет собственного
 * `no-restricted-syntax`/кастомного правила поверх поставленного
 * `.oxlintrc.json` (`categories`/`plugins`, без произвольных regex-правил),
 * а заводить отдельный ESLint-стек только ради одного запрета — лишняя
 * инфраструктура для пакета, где `pnpm test` и так гоняется в каждом CI-шаге.
 * Простой скан исходников гарантированно падает при регрессии, не требует
 * доп. тулчейна и покрывает оба паттерна SPEC — конструктор и `Date.now()`.
 */
describe('запрет нативного Date в packages/core/src (SPEC/00 §5)', () => {
  const offendingPatterns = [/\bnew Date\(/, /\bDate\.now\(/];

  it('ни один файл src не содержит `new Date(` или `Date.now(`', () => {
    const files = listSourceFiles(resolve(import.meta.dirname, '../src'));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of offendingPatterns) {
        if (pattern.test(content)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(offenders, `найден нативный Date:\n${offenders.join('\n')}`).toEqual([]);
  });
});
