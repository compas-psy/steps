#!/usr/bin/env node
/**
 * check-license-allowlist — скан лицензий зависимостей против allowlist,
 * гейт цепочки поставки (SPEC/08 §11.1, SPEC/05 §18.1/§19, решение ?19 в
 * `.ultraplan/open-questions.md`).
 *
 * §18.1: «Reciprocal/network-copyleft dependencies require explicit
 * approval», «SBOM + dependency license scan are release requirements».
 * Значит поведение по умолчанию — deny: лицензия обязана явно значиться в
 * `scripts/license-policy.json` → `allow`, иначе сборка падает. «Не в
 * списке» — это открытый вопрос человеку, а не пропуск с предупреждением:
 * тихий warn через пару спринтов никто не читает, а red build нельзя не
 * заметить. У человека есть выход без правки кода скрипта — добавить
 * разобранную запись в `license-policy.json` → `exceptions` с обоснованием.
 *
 * Источник данных — виртуальный стор pnpm (`node_modules/.pnpm/**`), а не
 * сетевой реестр: тот же граф, что реально лёг в `pnpm-lock.yaml` этой
 * сборкой, без похода в интернет. Это и переносимо (GitHub/GitVerse/
 * self-hosted — везде просто `node_modules` после `pnpm install
 * --frozen-lockfile`), и не даёt отчёту разъехаться с тем, что реально
 * собрано.
 *
 * Известный сейчас настоящий, не выдуманный кейс: `lightningcss`
 * (транзитивная зависимость `vite`, CSS-минификация на сборке) лицензирован
 * MPL-2.0 — reciprocal на уровне файла. В `license-policy.json` его нет ни
 * в allow, ни в exceptions, поэтому гейт валится на нём по замыслу: это
 * решение владельца (одобрить как build-time-only зависимость или
 * заменить), не то, что скрипт вправе решить сам.
 *
 * Запуск:
 *   node scripts/check-license-allowlist.mjs [--root <путь>]
 * Выход:
 *   0 — все лицензии разрешены или явно одобрены исключением;
 *   1 — есть зависимости, требующие решения человека;
 *   2 — ошибка запуска (например, `pnpm install` не выполнялся).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');

/** Явно копилефт-семейства — печатаются с отдельной подсказкой, даже если формально это «просто не в списке». */
const COPYLEFT_HINT = /^(A?L?GPL|SSPL|EUPL|OSL|CC-BY-SA|CDDL)\b/i;

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') {
      const value = argv[i + 1];
      if (!value) {
        console.error('check-license-allowlist: --root требует путь');
        process.exit(2);
      }
      options.root = resolve(value);
      i += 1;
    } else {
      console.error(`check-license-allowlist: неизвестный аргумент ${argv[i]}`);
      process.exit(2);
    }
  }
  return options;
}

function loadPolicy(root) {
  const path = join(root, 'scripts', 'license-policy.json');
  if (!existsSync(path)) {
    console.error(`check-license-allowlist: не найден ${path}`);
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const allow = new Set(data.allow ?? []);
  /** ключ "имя@версия" -> запись исключения, только если все пять полей заполнены. */
  const exceptions = new Map();
  for (const entry of data.exceptions ?? []) {
    const fields = ['package', 'version', 'license', 'reason', 'approvedBy', 'approvedAt'];
    const missing = fields.filter((f) => !entry[f] || String(entry[f]).trim() === '');
    if (missing.length > 0) {
      console.error(
        `check-license-allowlist: запись исключения для «${entry.package ?? '?'}» неполна ` +
          `(не хватает: ${missing.join(', ')}) — исключение не засчитано`,
      );
      continue;
    }
    exceptions.set(`${entry.package}@${entry.version}`, entry);
  }
  return { allow, exceptions };
}

/**
 * SPDX-подобное выражение → допустимо ли оно целиком по allowlist.
 * `A OR B` — достаточно одной разрешённой ветки (это и есть смысл OR:
 * потребитель выбирает лицензию). `A AND B` — обязаны быть разрешены обе.
 * Скобки просто снимаются: для этого набора зависимостей вложенности нет.
 */
function isExpressionAllowed(expr, allow) {
  const cleaned = expr.replace(/[()]/g, '').trim();
  if (/\bAND\b/i.test(cleaned)) {
    return cleaned
      .split(/\s+AND\s+/i)
      .map((s) => s.trim())
      .every((token) => allow.has(token));
  }
  return cleaned
    .split(/\s+OR\s+/i)
    .map((s) => s.trim())
    .some((token) => allow.has(token));
}

/** Нормализует поле `license`/`licenses` package.json к строке-выражению или null, если поля нет. */
function normalizeLicenseField(pkg) {
  if (typeof pkg.license === 'string' && pkg.license.trim() !== '') return pkg.license.trim();
  if (pkg.license && typeof pkg.license === 'object' && typeof pkg.license.type === 'string') {
    return pkg.license.type.trim();
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses
      .map((l) => (typeof l === 'string' ? l : l?.type))
      .filter(Boolean)
      .join(' OR ');
  }
  return null;
}

/** Обходит виртуальный стор pnpm и собирает по одной записи на реально установленный пакет (имя@версия). */
function collectInstalledPackages(root) {
  const pnpmDir = join(root, 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) {
    console.error(
      `check-license-allowlist: ${pnpmDir} не найден — выполните «pnpm install --frozen-lockfile» перед сканом.`,
    );
    process.exit(2);
  }

  /** ключ "имя@версия" -> { name, version, license, from } — dedup: разные peer-варианты одного пакета не дублируем. */
  const packages = new Map();

  const readPackageJson = (nmDir, pkgDirName) => {
    if (pkgDirName.startsWith('@')) {
      const scopedDir = join(nmDir, pkgDirName);
      if (!statSync(scopedDir).isDirectory()) return;
      for (const sub of readdirSync(scopedDir)) {
        readOne(join(scopedDir, sub, 'package.json'), `${pkgDirName}/${sub}`);
      }
      return;
    }
    readOne(join(nmDir, pkgDirName, 'package.json'), pkgDirName);
  };

  const readOne = (pkgJsonPath, name) => {
    if (!existsSync(pkgJsonPath)) return;
    let data;
    try {
      data = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    } catch {
      return;
    }
    const version = typeof data.version === 'string' ? data.version : 'unknown';
    const key = `${name}@${version}`;
    if (packages.has(key)) return;
    packages.set(key, { name, version, license: normalizeLicenseField(data) });
  };

  for (const storeEntry of readdirSync(pnpmDir)) {
    const nmDir = join(pnpmDir, storeEntry, 'node_modules');
    if (!existsSync(nmDir)) continue;
    for (const pkgDirName of readdirSync(nmDir)) {
      // Симлинки самого воркспейса (packages/*, apps/*) сюда не попадают —
      // pnpm линкует их напрямую в корневой node_modules, не в .pnpm/**.
      readPackageJson(nmDir, pkgDirName);
    }
  }
  return [...packages.values()];
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));
  const { allow, exceptions } = loadPolicy(root);
  const installed = collectInstalledPackages(root);

  const blocked = [];
  const missing = [];
  let approved = 0;
  let clean = 0;

  for (const pkg of installed) {
    if (pkg.license === null) {
      missing.push(pkg);
      continue;
    }
    if (isExpressionAllowed(pkg.license, allow)) {
      clean += 1;
      continue;
    }
    const exceptionKey = `${pkg.name}@${pkg.version}`;
    if (exceptions.has(exceptionKey)) {
      approved += 1;
      continue;
    }
    blocked.push(pkg);
  }

  blocked.sort((a, b) => a.name.localeCompare(b.name));
  missing.sort((a, b) => a.name.localeCompare(b.name));

  if (blocked.length > 0) {
    console.error('check-license-allowlist: лицензии вне allowlist, требуют решения человека:');
    for (const pkg of blocked) {
      const hint = COPYLEFT_HINT.test(pkg.license)
        ? ' — похоже на реципрокную/сетевую copyleft (SPEC/05 §18.1), по умолчанию блокирует релиз'
        : '';
      console.error(`  ${pkg.name}@${pkg.version}: ${pkg.license}${hint}`);
    }
  }
  if (missing.length > 0) {
    console.error(
      'check-license-allowlist: у пакетов не заявлена лицензия — тоже требует решения:',
    );
    for (const pkg of missing) console.error(`  ${pkg.name}@${pkg.version}: (license не указана)`);
  }

  if (blocked.length > 0 || missing.length > 0) {
    console.error('');
    console.error(
      `Заблокировано: ${blocked.length}, без лицензии: ${missing.length}, всего проверено: ${installed.length}.`,
    );
    console.error(
      'Одобрить: добавить запись в scripts/license-policy.json → exceptions ' +
        '(package, version, license, reason, approvedBy, approvedAt — все поля обязательны). ' +
        'Отклонить: заменить зависимость.',
    );
    process.exit(1);
  }

  console.log(
    `check-license-allowlist: чисто — проверено пакетов: ${installed.length} ` +
      `(разрешённых: ${clean}, одобренных исключением: ${approved}).`,
  );
  process.exit(0);
}

main();
