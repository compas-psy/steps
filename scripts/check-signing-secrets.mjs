#!/usr/bin/env node
/**
 * check-signing-secrets — сторож ключей подписи (SPEC/08 §4: «Private
 * signing materials never in repository/log»; SPEC/05 §19; решение →25/→26
 * в `.ultraplan/open-questions.md`).
 *
 * У Записок в `.gitignore` стояло исключение
 * `!apps/mobile/keystore/zapiski-release.jks`, которое отменяло общее
 * правило `*.jks` ровно для боевого ключа Android — его поймали до того,
 * как ключ уехал в репозиторий (см. комментарий в `.gitignore` этого
 * репозитория). Ключ и алиас нельзя сменить после первой публикации в
 * сторе — утечка необратима: чужой сборкой можно подписаться как нашим
 * обновлением. Этот скрипт — та самая проверка, обещанная комментарием
 * `.gitignore` («Сторожить это правило будет отдельная проверка в CI
 * (эпик E00.6)»).
 *
 * Три независимых проверки, каждая ловит свой способ, которым секретный
 * файл попадает в git:
 *
 *  1. Исключение (`!…`) в `.gitignore`, отменяющее игнор одного из
 *     секретных форматов — сам факт наличия такой строки уже нарушение,
 *     независимо от того, существует ли сейчас указанный файл.
 *  2. Файл секретного формата уже отслеживается git (`git ls-files`) —
 *     ловит случай, когда исключения нет, но файл всё равно оказался в
 *     индексе (например, добавлен по прямому пути `git add -f`).
 *  3. Контрольный выстрел: `git add --dry-run` над пробным файлом каждого
 *     секретного формата — подтверждает, что обычный `git add .` НЕ
 *     подхватит такой файл ГДЕ УГОДНО в дереве, а не только там, где
 *     `.gitignore` про него сейчас помнит. Пробные файлы создаются вне
 *     индекса и удаляются сразу после проверки — `git add --dry-run`
 *     ничего не пишет в индекс сам по себе, но каталог и файлы за собой
 *     скрипт убирает явно.
 *
 * Список форматов: `*.jks`, `*.keystore`, `*.p12`, `*.pem` — секретные
 * форматы подписи/сертификатов, названные в задаче этого пакета работ.
 *
 * Запуск:
 *   node scripts/check-signing-secrets.mjs [--root <путь>]
 * Выход:
 *   0 — исключений и отслеживаемых секретов нет; 1 — найдено; 2 — ошибка запуска.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..');

/** Расширения секретных форматов подписи/сертификатов (без точки, для сборки regex). */
const SECRET_EXTENSIONS = ['jks', 'keystore', 'p12', 'pem'];

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') {
      const value = argv[i + 1];
      if (!value) {
        console.error('check-signing-secrets: --root требует путь');
        process.exit(2);
      }
      options.root = resolve(value);
      i += 1;
    } else {
      console.error(`check-signing-secrets: неизвестный аргумент ${argv[i]}`);
      process.exit(2);
    }
  }
  return options;
}

function git(root, args) {
  // stdio.stderr на 'pipe': без этого git-подсказки ("The following paths are
  // ignored…") утекают прямо в терминал раньше, чем execFileSync успевает
  // бросить исключение — печатать их решает сам скрипт, по месту.
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Строки-исключения (`!…`) в .gitignore, возвращающие в индекс один из секретных форматов. */
function findGitignoreExceptions(root) {
  const path = join(root, '.gitignore');
  if (!existsSync(path)) return [];
  const extAlternation = SECRET_EXTENSIONS.join('|');
  const re = new RegExp(`^!.*\\.(?:${extAlternation})$`);
  const lines = readFileSync(path, 'utf8').split('\n');
  const found = [];
  lines.forEach((line, index) => {
    if (re.test(line.trim())) found.push({ line: index + 1, text: line.trim() });
  });
  return found;
}

/** Файлы секретных форматов, уже отслеживаемые git — независимо от текущего .gitignore. */
function findTrackedSecrets(root) {
  const extAlternation = SECRET_EXTENSIONS.join('|');
  const re = new RegExp(`\\.(?:${extAlternation})$`, 'i');
  const files = git(root, ['ls-files']).split('\n').filter(Boolean);
  return files.filter((f) => re.test(f));
}

/**
 * Контрольный выстрел: для каждого секретного формата создаёт пробный файл
 * во временном каталоге ВНУТРИ дерева репозитория (иначе `git add
 * --dry-run` не сможет его оценить относительно правил `.gitignore`) и
 * проверяет, что обычный `git add` его не подхватит. Каталог и файлы
 * убираются сразу после проверки; сам `--dry-run` ничего в индекс не пишет.
 */
function probeIgnoreCoverage(root) {
  const probeDir = mkdtempSync(join(root, '.secret-probe-'));
  const leaks = [];
  try {
    for (const ext of SECRET_EXTENSIONS) {
      const probePath = join(probeDir, `probe.${ext}`);
      writeFileSync(probePath, '');
      let output = '';
      try {
        output = git(root, ['add', '--dry-run', probePath]);
      } catch {
        // `git add --dry-run` на файле, который правило .gitignore отвергает,
        // завершается ошибкой (или печатает "The following paths are
        // ignored…" и падает) — это и есть желаемый исход, не ошибка скрипта.
        output = '';
      }
      // Пустой вывод/ошибка = git отказался добавлять файл = формат игнорируется.
      // Непустой вывод "add '<path>'" = файл БЫЛ БЫ добавлен = дыра в .gitignore.
      if (output.trim() !== '') leaks.push(ext);
    }
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
  return leaks;
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));

  const exceptions = findGitignoreExceptions(root);
  const tracked = findTrackedSecrets(root);
  const leaks = probeIgnoreCoverage(root);

  let failed = false;

  if (exceptions.length > 0) {
    failed = true;
    console.error('check-signing-secrets: .gitignore содержит исключение для секретного формата:');
    for (const e of exceptions) console.error(`  .gitignore:${e.line}  ${e.text}`);
  }

  if (tracked.length > 0) {
    failed = true;
    console.error('check-signing-secrets: в индексе git уже есть файлы секретного формата:');
    for (const f of tracked) console.error(`  ${f}`);
  }

  if (leaks.length > 0) {
    failed = true;
    console.error(
      'check-signing-secrets: обычный `git add` подхватил бы файл следующих форматов ' +
        'где угодно в дереве — правило .gitignore не покрывает их (или отменено):',
    );
    for (const ext of leaks) console.error(`  *.${ext}`);
  }

  if (failed) {
    console.error('');
    console.error(
      'Ключ подписи Android нельзя сменить после первой публикации в сторе — утечка необратима. ' +
        'Секрет считается скомпрометированным при любом попадании в git, даже в истории одного ' +
        'коммита: отзовите и перевыпустите, удаления коммита недостаточно. Ключи приезжают в сборку ' +
        'только через секреты CI (ANDROID_KEYSTORE_* и т.п.), в git — никогда.',
    );
    process.exit(1);
  }

  console.log(
    `check-signing-secrets: чисто — исключений в .gitignore нет, отслеживаемых секретов нет, ` +
      `все форматы (${SECRET_EXTENSIONS.map((e) => `*.${e}`).join(', ')}) игнорируются во всём дереве.`,
  );
  process.exit(0);
}

main();
