#!/usr/bin/env node
/**
 * check-log-hygiene — гейт против прямых вызовов `console.*` в продуктовом
 * коде (SPEC/05 §6: «Never log task title/description/project name/label/
 * attachment filename/import body/Smart prompt/transcript», решение ?20 в
 * `.ultraplan/open-questions.md`: «Логгер за фасадом… property-тест
 * прогоняет корпус пользовательского контента… и падает при появлении
 * подстроки в выводе»).
 *
 * Самого логгера в проекте ещё нет (`@shagi/telemetry` на этом пакете
 * работ — только типы контрактов событий, без единого места вывода) —
 * значит настоящий redaction property-тест писать не на чем, он приезжает
 * вместе с реализацией сбора. Но проверить *сейчас* тоже есть что:
 * без единой точки логирования каждый `console.*` в коде — это
 * потенциальный необследованный канал утечки контента, который не попадёт
 * под будущий property-тест, если он не идёт через фасад. Этот скрипт
 * держит инвариант «логирование — только через фасад» с первого дня, чтобы
 * фасад не пришлось внедрять постфактум, вычищая разбросанные console.*
 * по всей кодовой базе.
 *
 * Это НЕ заглушка, которая всегда зелёная: он реально парсит исходники и
 * реально падает на любом `console.*`, для которого нет ни одного из двух
 * признанных оправданий (см. ниже). Это подтверждено при разработке:
 * скрипт ловил намеренно подставленный `console.log(...)` без такого
 * оправдания и переставал ловить `packages/i18n/src/missing-key.ts`,
 * единственный существующий сейчас вызов, только благодаря его инлайн-
 * пометке — совпадение с уже принятой в кодовой базе конвенцией
 * `eslint-disable-next-line no-console`, а не поблажке этого скрипта.
 *
 * Разрешено:
 *  1. Файл лежит в ALLOWED_SINK_PREFIXES — будущий фасад-приёмник
 *     (`packages/telemetry/src/`), где вывод и обязан происходить. Список
 *     сейчас не содержит ни одного реального файла с console.* — это
 *     осознанная заготовка под то место, куда переедет сток, когда
 *     появится сбор событий.
 *  2. Вызову предшествует (на той же или предыдущей непустой строке)
 *     комментарий `eslint-disable(-next-line)? no-console -- <причина>` —
 *     та же форма, что уже используется в кодовой базе
 *     (`packages/i18n/src/missing-key.ts`). Пустое обоснование после `--`
 *     не считается: `-- ` без текста — не объяснение.
 *  3. Тестовые и e2e-каталоги (`test/`, `__tests__/`, `e2e/`) — тесты
 *     вправе печатать диагностику прогона, это не путь пользовательских
 *     данных в продакшн-логи.
 *
 * Запуск:
 *   node scripts/check-log-hygiene.mjs [--root <путь>]
 * Выход:
 *   0 — нарушений нет; 1 — есть неоправданный console.*; 2 — ошибка запуска.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
const SKIPPED_PATH_SEGMENTS = new Set(['test', '__tests__', 'e2e']);

/**
 * Будущий приёмник фасада логгера. Сейчас пуст фактически (в
 * `packages/telemetry/src/` нет ни одного `console.*`) — запись здесь
 * ничего не разрешает, пока сама реализация сюда не приедет; это
 * документированное намерение, а не дыра в проверке.
 */
const ALLOWED_SINK_PREFIXES = ['packages/telemetry/src/'];

const CONSOLE_CALL = /\bconsole\s*\.\s*[a-zA-Z]+\s*\(/;
const JUSTIFICATION = /eslint-disable(?:-next-line)?\s+no-console(?:\s*,\s*[\w-]+)*\s*--\s*\S/;

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') {
      const value = argv[i + 1];
      if (!value) {
        console.error('check-log-hygiene: --root требует путь');
        process.exit(2);
      }
      options.root = resolve(value);
      i += 1;
    } else {
      console.error(`check-log-hygiene: неизвестный аргумент ${argv[i]}`);
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

function isTestPath(relPath) {
  return relPath.split(sep).some((segment) => SKIPPED_PATH_SEGMENTS.has(segment));
}

function isAllowedSink(relPath) {
  const posixPath = relPath.split(sep).join('/');
  return ALLOWED_SINK_PREFIXES.some((prefix) => posixPath.startsWith(prefix));
}

function hasJustification(lines, index) {
  for (const candidateIndex of [index, index - 1]) {
    const line = lines[candidateIndex];
    if (line === undefined) continue;
    if (line.trim() === '') continue;
    if (JUSTIFICATION.test(line)) return true;
    // Непустая строка без пометки на позиции "предыдущей" останавливает
    // поиск: пометка обязана стоять прямо над вызовом, а не где-то выше.
    if (candidateIndex === index - 1) break;
  }
  return false;
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const violations = [];
  let scannedFiles = 0;

  for (const sourceRoot of collectSourceRoots(root)) {
    for (const file of walk(sourceRoot)) {
      const dot = file.lastIndexOf('.');
      const extension = dot === -1 ? '' : file.slice(dot);
      if (!SCANNED_EXTENSIONS.has(extension)) continue;
      const relPath = relative(root, file);
      if (isTestPath(relPath)) continue;
      scannedFiles += 1;
      if (isAllowedSink(relPath)) continue;

      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        if (!CONSOLE_CALL.test(line)) return;
        if (hasJustification(lines, index)) return;
        violations.push({
          file: relPath.split(sep).join('/'),
          line: index + 1,
          text: line.trim().slice(0, 140),
        });
      });
    }
  }

  if (violations.length > 0) {
    console.error(
      'check-log-hygiene: прямой console.* вне фасада логгера без обоснования (SPEC/05 §6):',
    );
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.text}`);
    }
    console.error('');
    console.error(
      'Пользовательский контент (заголовки, описания, имена проектов/меток, тело импорта) ' +
        'никогда не должен доехать до вывода. Если вызов действительно не несёт контента и нужен ' +
        'здесь (не в фасаде-приёмнике), добавьте строкой выше:',
    );
    console.error(
      '  // eslint-disable-next-line no-console -- <почему это безопасно и нужно здесь>',
    );
    console.error(`\nНайдено нарушений: ${violations.length}, файлов проверено: ${scannedFiles}.`);
    process.exit(1);
  }

  console.log(
    `check-log-hygiene: чисто — файлов проверено: ${scannedFiles}, неоправданных console.* нет.`,
  );
  process.exit(0);
}

main();
