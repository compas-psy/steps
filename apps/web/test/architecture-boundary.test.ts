/**
 * Инвариант SPEC/00 §3: «ни одного product screen/business rule/NLP/sync
 * rule/user copy/pricing rule в apps/*». Живёт здесь (а не в трёх копиях по
 * оболочкам), потому что оболочка одна, а нарушить границу можно из любой —
 * сканирует `apps/web`, `apps/desktop`, `apps/mobile` целиком.
 *
 * Два независимых механизма ловли, оба на уровне типов/AST, не «на глаз»:
 *
 *  1. **Импорты в обход `@shagi/app`.** Направление зависимостей
 *     (`docs/dev/contributing.md`, «Границы пакетов»):
 *     `apps/* → @shagi/app → @shagi/{core,storage,sync,nlp,importer,
 *     telemetry,i18n,contracts}`. Оболочке разрешено напрямую видеть только
 *     `@shagi/app` (что монтировать), `@shagi/platform` (типы портов,
 *     которые она реализует) и `@shagi/ui` (токены/CSS — `@shagi/ui` и так
 *     не содержит продуктовых строк по своей же архитектуре). Прямой импорт
 *     любого из доменных пакетов оболочкой — обход границы, а не решение
 *     платформенной задачи. Тем же способом ловится и обход через
 *     относительный путь `packages/<domain>/src/...` в обход `exports`
 *     пакета.
 *
 *  2. **Продуктовый текст в JSX.** Ищутся кириллические символы в
 *     JSX-тексте и в значениях JSX-атрибутов, которые реально показываются
 *     человеку (`alt`, `title`, `placeholder`, `aria-*`) — через TypeScript
 *     Compiler API, а не regex по исходнику: так проверка видит ровно узлы
 *     AST, которые рендерятся, и не задевает русские комментарии и
 *     сообщения об ошибках для разработчика (`docs/dev/contributing.md`,
 *     «Язык» — комментарии и ошибки по-русски, это НЕ то же самое, что
 *     пользовательский текст экрана).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const APPS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FORBIDDEN_DOMAIN_PACKAGES = [
  'core',
  'storage',
  'sync',
  'nlp',
  'importer',
  'telemetry',
  'i18n',
  'contracts',
] as const;

const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'target', 'gen']);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIPPED_DIRS.has(entry)) continue;
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

/** `apps/<name>/src/**` для каждой из трёх оболочек, что реально есть на диске. */
function appSrcDirs(): string[] {
  return ['web', 'desktop', 'mobile']
    .map((name) => path.join(APPS_ROOT, name, 'src'))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory();
      } catch {
        return false;
      }
    });
}

const sourceFiles = appSrcDirs().flatMap((dir) => collectSourceFiles(dir));

const IMPORT_PATTERN =
  /from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function findForbiddenImports(source: string): string[] {
  const violations: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? '';

    const domainPackage = FORBIDDEN_DOMAIN_PACKAGES.find(
      (name) => specifier === `@shagi/${name}` || specifier.startsWith(`@shagi/${name}/`),
    );
    if (domainPackage) {
      violations.push(`@shagi/${domainPackage} (напрямую, минуя @shagi/app)`);
      continue;
    }

    if (/packages\/(core|storage|sync|nlp|importer|telemetry|i18n|contracts)\//.test(specifier)) {
      violations.push(`${specifier} (относительный путь в обход exports пакета)`);
    }
  }
  return violations;
}

describe('findForbiddenImports — самопроверка: чекер действительно ловит нарушение, а не молчит всегда', () => {
  it('ловит прямой импорт @shagi/core', () => {
    expect(findForbiddenImports("import { X } from '@shagi/core';")).not.toEqual([]);
  });
  it('ловит импорт @shagi/i18n/catalog в обход @shagi/app', () => {
    expect(findForbiddenImports("import { t } from '@shagi/i18n/catalog';")).not.toEqual([]);
  });
  it('ловит относительный обход exports пакета packages/nlp/src', () => {
    expect(
      findForbiddenImports("import { parse } from '../../packages/nlp/src/index.js';"),
    ).not.toEqual([]);
  });
  it('не ловит разрешённые @shagi/app, @shagi/platform, @shagi/ui', () => {
    expect(
      findForbiddenImports(
        "import { App } from '@shagi/app';\nimport type { PlatformCapabilitiesRegistry } from '@shagi/platform';\nimport '@shagi/ui/tokens.css';",
      ),
    ).toEqual([]);
  });
});

describe('SPEC §3: apps/* не импортирует домен в обход @shagi/app', () => {
  it('в дереве apps/*/src нашлись файлы для проверки', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  for (const file of sourceFiles) {
    const relative = path.relative(APPS_ROOT, file);
    it(`${relative}: нет прямого импорта доменных пакетов`, () => {
      const violations = findForbiddenImports(readFileSync(file, 'utf8'));
      expect(violations, violations.join('; ')).toEqual([]);
    });
  }
});

const CYRILLIC = /[А-Яа-яЁё]/;
const USER_FACING_ATTRS = new Set([
  'alt',
  'title',
  'placeholder',
  'aria-label',
  'aria-description',
  'aria-valuetext',
]);

/**
 * Только JSX-текст и «показываемые» атрибуты — не regex по всему файлу,
 * иначе русский комментарий или `throw new Error('...')` для разработчика
 * (`docs/dev/contributing.md`, «Язык») ложно считались бы нарушением.
 */
function findCyrillicJsx(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxText(node) && CYRILLIC.test(node.text)) {
      violations.push(`JSX-текст: «${node.text.trim()}»`);
    }
    if (
      ts.isJsxAttribute(node) &&
      USER_FACING_ATTRS.has(node.name.getText(sourceFile)) &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer) &&
      CYRILLIC.test(node.initializer.text)
    ) {
      violations.push(`атрибут ${node.name.getText(sourceFile)}="${node.initializer.text}"`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

describe('findCyrillicJsx — самопроверка: чекер ловит рендерящийся текст, но не комментарии/ошибки', () => {
  it('ловит кириллический JSX-текст', () => {
    expect(findCyrillicJsx('x.tsx', 'const el = <div>Сегодня</div>;')).not.toEqual([]);
  });
  it('ловит кириллицу в aria-label', () => {
    expect(findCyrillicJsx('x.tsx', 'const el = <button aria-label="Закрыть" />;')).not.toEqual([]);
  });
  it('НЕ ловит русский комментарий рядом с JSX', () => {
    expect(
      findCyrillicJsx(
        'x.tsx',
        '// корневой узел, экраны придут в E04\nconst el = <div data-x="" />;',
      ),
    ).toEqual([]);
  });
  it('НЕ ловит русское сообщение throw new Error() для разработчика', () => {
    expect(
      findCyrillicJsx('x.tsx', "if (!x) throw new Error('Не найден #root');\nconst el = <div />;"),
    ).toEqual([]);
  });
});

describe('SPEC §3: в JSX оболочек нет пользовательского текста', () => {
  const tsxFiles = sourceFiles.filter((file) => file.endsWith('.tsx'));

  it('в дереве apps/*/src нашлись .tsx файлы для проверки', () => {
    expect(tsxFiles.length).toBeGreaterThan(0);
  });

  for (const file of tsxFiles) {
    const relative = path.relative(APPS_ROOT, file);
    it(`${relative}: ни одного кириллического JSX-текста/атрибута`, () => {
      const violations = findCyrillicJsx(file, readFileSync(file, 'utf8'));
      expect(violations, violations.join('; ')).toEqual([]);
    });
  }
});
