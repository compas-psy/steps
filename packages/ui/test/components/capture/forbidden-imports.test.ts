/**
 * Архитектурный инвариант пакета работ E03.7 (задание, «Архитектурное
 * ограничение»): компоненты `capture/` — чисто презентационные, никакого
 * `@shagi/core`/`@shagi/app`/`@shagi/i18n`/`@shagi/nlp`/
 * `@js-temporal/polyfill`. Тот же приём, что `apps/web/test/
 * architecture-boundary.test.ts` использует для границы `apps/*` —
 * сканирование исходников по AST импортов, не «на глаз» — но с
 * собственным, гораздо более узким списком запрещённых пакетов: сюда
 * запрещён не только «домен в обход `@shagi/app`» (там весь список из
 * восьми пакетов), а весь домен целиком, включая сам `@shagi/app` —
 * презентационный компонент не должен знать о нём вообще.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const CAPTURE_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src/components/capture',
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
      violations.push(`${specifier} (запрещён в презентационном capture/)`);
    }
  }
  return violations;
}

describe('findForbiddenImports — самопроверка: чекер действительно ловит нарушение', () => {
  it('ловит прямой импорт @shagi/nlp', () => {
    expect(findForbiddenImports("import { parse } from '@shagi/nlp';")).not.toEqual([]);
  });
  it('ловит импорт @js-temporal/polyfill', () => {
    expect(findForbiddenImports("import { Temporal } from '@js-temporal/polyfill';")).not.toEqual(
      [],
    );
  });
  it('ловит @shagi/app даже без прямого продуктового текста', () => {
    expect(findForbiddenImports("import { useApp } from '@shagi/app';")).not.toEqual([]);
  });
  it('не ловит разрешённые react/относительные импорты внутри пакета', () => {
    expect(
      findForbiddenImports(
        "import { type ReactElement } from 'react';\nimport { Chip } from '../Chip.js';",
      ),
    ).toEqual([]);
  });
});

describe('E03.7: components/capture/** не импортирует домен (§ задания «Архитектурное ограничение»)', () => {
  const sourceFiles = collectSourceFiles(CAPTURE_SRC);

  it('в capture/ нашлись файлы для проверки', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const file of sourceFiles) {
    const relative = path.relative(CAPTURE_SRC, file);
    it(`${relative}: нет импорта домена/i18n/nlp/Temporal`, () => {
      const violations = findForbiddenImports(readFileSync(file, 'utf8'));
      expect(violations, violations.join('; ')).toEqual([]);
    });
  }
});
