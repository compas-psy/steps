#!/usr/bin/env node
/**
 * check-i18n-catalog — полнота каталога `ru-RU` как CI-гейт.
 *
 * SPEC/00 §13.1: «Missing Russian key/fallback-to-key in production build
 * is a CI failure.» Прод-поведение недостающего ключа (исключение, а не
 * тихая подстановка имени ключа) реализовано рантаймом `@shagi/i18n`
 * (packages/i18n/src/missing-key.ts); этот скрипт — статический гейт
 * *до* рантайма: ловит расхождение каталога и кода на этапе CI, а не когда
 * пользователь долистает до нужного экрана в production-сборке.
 *
 * Проверяет:
 *  1. каждый литеральный вызов `t('namespace', 'key', ...)`, найденный в
 *     `packages/*\/src` и `apps/*\/src`, ссылается на реально существующий
 *     ключ каталога `ru-RU` — иначе ПАДЕНИЕ. Это и есть проверяемая
 *     неполнота `ru-RU`: код рассчитывает на строку, которой в каталоге нет;
 *  2. каждый ключ каталога `ru-RU` используется хотя бы одним таким
 *     вызовом — иначе предупреждение (мёртвый перевод). Не валит CI по
 *     умолчанию: на раннем этапе пакетов-потребителей почти нет, и это
 *     ожидаемо — включается `--fail-on-unused`, когда каталог достаточно
 *     нарастили и мёртвые ключи стали сигналом, а не шумом.
 *
 * Статический анализ регулярным выражением по исходникам, а не разбором
 * TS/SWC-AST: этого достаточно, пока единственная форма вызова —
 * `t('ns', 'key', ...)` с литеральными строковыми аргументами (см.
 * `packages/i18n/src/translate.ts`). Динамический ключ (`t(ns, computedKey)`)
 * этот скрипт не увидит — сознательное ограничение первой итерации,
 * задокументированное здесь; рантайм-рубеж на этот случай —
 * `packages/i18n/src/missing-key.ts` (production бросает исключение).
 *
 * Запуск:
 *   node scripts/check-i18n-catalog.mjs [--root <путь>] [--quiet] [--fail-on-unused]
 * Выход:
 *   0 — каталог `ru-RU` полон (и, если указан --fail-on-unused, чист от
 *       неиспользуемых ключей); 1 — есть нарушения; 2 — ошибка запуска.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');
const CATALOG_DIR = 'packages/i18n/src/catalog/ru-RU';

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  'test',
  '__tests__',
]);

/** `t('namespace', 'key', ...)` — только литеральные строковые аргументы (см. заголовок файла). */
const CALL_PATTERN = /\bt\(\s*(['"])([A-Za-z0-9_.-]+)\1\s*,\s*(['"])([A-Za-z0-9_.-]+)\3/g;

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, quiet: false, failOnUnused: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value) {
        console.error('check-i18n-catalog: --root требует путь');
        process.exit(2);
      }
      options.root = resolve(value);
      index += 1;
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '--fail-on-unused') {
      options.failOnUnused = true;
    } else {
      console.error(`check-i18n-catalog: неизвестный аргумент ${arg}`);
      process.exit(2);
    }
  }
  return options;
}

function* walk(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/** packages/<pkg>/src и apps/<app>/src — та же схема, что у `scripts/lint-tokens.mjs` в ЗАПИСКАХ. */
function collectSourceRoots(root) {
  const roots = [];
  for (const group of ['packages', 'apps']) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = join(base, entry.name, 'src');
      if (existsSync(src) && statSync(src).isDirectory()) roots.push(src);
    }
  }
  return roots;
}

function loadCatalog(root) {
  const dir = resolve(root, CATALOG_DIR);
  if (!existsSync(dir)) {
    console.error(`check-i18n-catalog: каталог ru-RU не найден по пути ${relative(root, dir)}`);
    process.exit(2);
  }
  /** id "namespace::key" -> { namespace, key, file } */
  const declared = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const namespace = entry.name.slice(0, -'.json'.length);
    const filePath = join(dir, entry.name);
    const relPath = relative(root, filePath);
    let data;
    try {
      data = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`check-i18n-catalog: не удалось разобрать ${relPath}: ${error.message}`);
      process.exit(2);
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      console.error(
        `check-i18n-catalog: ${relPath} должен быть плоским JSON-объектом строка → строка`,
      );
      process.exit(2);
    }
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== 'string' || value.length === 0) {
        console.error(
          `check-i18n-catalog: ${relPath} → "${key}": значение должно быть непустой строкой`,
        );
        process.exit(2);
      }
      declared.set(`${namespace}::${key}`, { namespace, key, file: relPath });
    }
  }
  if (declared.size === 0) {
    console.error(
      `check-i18n-catalog: каталог ru-RU пуст (${relative(root, dir)}) — проверять нечего`,
    );
    process.exit(2);
  }
  return declared;
}

function positionOf(text, index) {
  const before = text.slice(0, index);
  return before.split('\n').length;
}

function collectUsages(root) {
  /** id "namespace::key" -> [{ file, line }] */
  const usages = new Map();
  for (const sourceRoot of collectSourceRoots(root)) {
    for (const file of walk(sourceRoot)) {
      const dot = file.lastIndexOf('.');
      const extension = dot === -1 ? '' : file.slice(dot);
      if (!SCANNED_EXTENSIONS.has(extension)) continue;
      const text = readFileSync(file, 'utf8');
      CALL_PATTERN.lastIndex = 0;
      let match;
      while ((match = CALL_PATTERN.exec(text)) !== null) {
        const namespace = match[2];
        const key = match[4];
        const id = `${namespace}::${key}`;
        const line = positionOf(text, match.index);
        const list = usages.get(id) ?? [];
        list.push({ namespace, key, file: relative(root, file).split(sep).join('/'), line });
        usages.set(id, list);
      }
    }
  }
  return usages;
}

function main() {
  const { root, quiet, failOnUnused } = parseArgs(process.argv.slice(2));

  const declared = loadCatalog(root);
  const usages = collectUsages(root);

  const missing = [];
  for (const [id, occurrences] of usages) {
    if (!declared.has(id)) missing.push(...occurrences);
  }
  missing.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const unused = [...declared.values()].filter(
    ({ namespace, key }) => !usages.has(`${namespace}::${key}`),
  );
  unused.sort((a, b) => a.file.localeCompare(b.file) || a.key.localeCompare(b.key));

  if (missing.length > 0) {
    console.error('check-i18n-catalog: код ссылается на ключи, которых нет в каталоге ru-RU');
    for (const item of missing) {
      console.error(
        `  ${item.file}:${item.line}  t('${item.namespace}', '${item.key}', …) → нет в каталоге`,
      );
    }
  }

  if (unused.length > 0) {
    const stream = failOnUnused ? console.error : console.warn;
    stream(
      failOnUnused
        ? 'check-i18n-catalog: неиспользуемые ключи каталога (--fail-on-unused)'
        : 'check-i18n-catalog: неиспользуемые ключи каталога (предупреждение, не валит гейт)',
    );
    for (const item of unused) {
      stream(`  ${item.file} → "${item.namespace}.${item.key}"`);
    }
  }

  const failed = missing.length > 0 || (failOnUnused && unused.length > 0);
  if (failed) {
    console.error('');
    console.error(
      `Найдено: отсутствующих в каталоге ключей — ${missing.length}, неиспользуемых — ${unused.length}.`,
    );
    if (missing.length > 0) {
      console.error(
        'Отсутствующий ключ ru-RU — CI failure (SPEC/00 §13.1). Добавьте ключ в ' +
          `${CATALOG_DIR}/<namespace>.json или поправьте опечатку в вызове t().`,
      );
    }
    process.exit(1);
  }

  if (!quiet) {
    const totalUsages = [...usages.values()].reduce((sum, list) => sum + list.length, 0);
    console.log(
      `check-i18n-catalog: чисто — ключей в каталоге ru-RU: ${declared.size}, ` +
        `использований t(): ${totalUsages}, неиспользуемых ключей: ${unused.length}.`,
    );
  }
  process.exit(0);
}

main();
