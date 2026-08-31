/**
 * Архитектурный инвариант пакета работ E03.8 (задание, «Архитектурное
 * ограничение») — тот же приём, что `test/components/capture/
 * forbidden-imports.test.ts` (E03.7) использует для `capture/`:
 * сканирование исходников по импортам, не «на глаз», с собственной
 * самопроверкой чекера. `account/` — презентационные компоненты формы
 * входа/статуса синхронизации/тарифа: запрещён весь домен целиком
 * (включая `@shagi/app`), NLP, i18n-пакет и Temporal — компонент не
 * должен знать про auth-протокол, sync-логику или продуктовые строки
 * напрямую.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ACCOUNT_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src/components/account',
);

const FORBIDDEN_SPECIFIERS = [
  '@shagi/core',
  '@shagi/app',
  '@shagi/i18n',
  '@shagi/nlp',
  '@js-temporal/polyfill',
] as const;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const IMPORT_PATTERN =
  /from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function findForbiddenImports(source: string): string[] {
  const violations: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? '';
    const hit = FORBIDDEN_SPECIFIERS.find(
      (name) => specifier === name || specifier.startsWith(`${name}/`),
    );
    if (hit) {
      violations.push(`${specifier} (запрещён в презентационном account/)`);
    }
  }
  return violations;
}

describe('findForbiddenImports — самопроверка: чекер действительно ловит нарушение', () => {
  it('ловит прямой импорт @shagi/app', () => {
    expect(findForbiddenImports("import { useAuth } from '@shagi/app';")).not.toEqual([]);
  });
  it('ловит импорт @js-temporal/polyfill', () => {
    expect(findForbiddenImports("import { Instant } from '@js-temporal/polyfill';")).not.toEqual(
      [],
    );
  });
  it('ловит глубокий импорт @shagi/core/commands', () => {
    expect(
      findForbiddenImports("import { CreateTaskCommand } from '@shagi/core/commands';"),
    ).not.toEqual([]);
  });
  it('не ловит разрешённые react/относительные импорты внутри пакета', () => {
    expect(
      findForbiddenImports(
        "import { type ReactElement } from 'react';\nimport { Button } from '../Button.js';",
      ),
    ).toEqual([]);
  });
});

describe('E03.8: components/account/** не импортирует домен (§ задания «Архитектурное ограничение»)', () => {
  const sourceFiles = collectSourceFiles(ACCOUNT_SRC);

  it('в account/ нашлись файлы для проверки', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const file of sourceFiles) {
    const relative = path.relative(ACCOUNT_SRC, file);
    it(`${relative}: нет импорта домена/i18n/nlp/Temporal`, () => {
      const violations = findForbiddenImports(readFileSync(file, 'utf8'));
      expect(violations, violations.join('; ')).toEqual([]);
    });
  }
});
