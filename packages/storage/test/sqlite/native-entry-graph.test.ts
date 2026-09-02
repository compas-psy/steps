import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Гейт графа импортов нативной точки входа (`@shagi/storage/sqlite-native`).
 *
 * Смысл — не стиль, а живая поломка. `node-sqlite-driver.ts` делает
 * `import { DatabaseSync } from 'node:sqlite'` на верхнем уровне; ES-модуль
 * выполняется целиком при импорте ЛЮБОГО имени из него, а в WebView
 * Android модуля `node:sqlite` не существует. Один статический импорт,
 * дотянувшийся до него из нативного пути, гарантированно роняет оболочку
 * до первого рендера — экран пустой, без единого сообщения. Ни сборка, ни
 * модульные тесты этого не ловят (разбор — в `@shagi/app`
 * `state/storage-backend.ts`), поэтому проверка структурная и здесь.
 */
const ROOT = resolve(import.meta.dirname, '../../src/sqlite');

function importsOf(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  // `import type` / `export type` НЕ учитываются: TypeScript стирает такие
  // импорты целиком, ни байта в рантайм не попадает. Различие
  // принципиальное — именно на нём построено разделение файлов
  // (`migrations.ts` знает тип `NodeSqliteDriver`, но не значение).
  return [...source.matchAll(/^\s*(?:import|export)(?!\s+type\b)[^'"]*from\s+'([^']+)'/gm)].map(
    (match) => match[1] as string,
  );
}

/** Обход графа с точки входа по относительным импортам. */
function reachableFiles(entry: string): { files: Set<string>; external: Set<string> } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    if (files.has(current)) continue;
    files.add(current);
    for (const specifier of importsOf(current)) {
      if (!specifier.startsWith('.')) {
        external.add(specifier);
        continue;
      }
      const next = resolve(dirname(current), specifier.replace(/\.js$/, '.ts'));
      queue.push(next);
    }
  }
  return { files, external };
}

describe('нативная точка входа SQLite', () => {
  const { files, external } = reachableFiles(resolve(ROOT, 'native.ts'));

  it('не дотягивается до драйвера на node:sqlite', () => {
    const offenders = [...files].filter((file) => file.endsWith('node-sqlite-driver.ts'));
    expect(offenders).toEqual([]);
  });

  it('не импортирует ни одного модуля node:', () => {
    expect([...external].filter((name) => name.startsWith('node:'))).toEqual([]);
  });

  it('гейт живой: тот же обход из общего барреля node:sqlite ВИДИТ', () => {
    // Проверка, что обход вообще работает: из `./index.ts` драйвер
    // достижим, и если бы он был достижим из `native.ts`, тест выше
    // покраснел бы.
    const barrel = reachableFiles(resolve(ROOT, 'index.ts'));
    expect([...barrel.files].some((file) => file.endsWith('node-sqlite-driver.ts'))).toBe(true);
    expect([...barrel.external]).toContain('node:sqlite');
  });
});
