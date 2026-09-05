/**
 * Собирает из `docs/legal/*.md` две вещи, которые ОБЯЗАНЫ совпадать
 * дословно:
 *
 *  1. `packages/legal/src/documents.generated.ts` — то, что уезжает в
 *     бандл приложения и показывается офлайн;
 *  2. `apps/web/public/legal/*.html` — статические страницы для магазина
 *     и для ссылки из карточки приложения.
 *
 * Оба артефакта порождены ОДНИМ исходником, поэтому расхождение между
 * версией в приложении и версией в вебе невозможно не «по договорённости»,
 * а по построению. CI пересобирает их и падает на любом diff.
 *
 * Запуск: `node scripts/build-legal.mjs` (перезаписывает),
 * `node scripts/build-legal.mjs --check` (только сверяет).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LEGAL_DIR = 'docs/legal';
const GENERATED_TS = 'packages/legal/src/documents.generated.ts';
const WEB_DIR = 'apps/web/public/legal';
const checkOnly = process.argv.includes('--check');

const registry = JSON.parse(readFileSync(join(LEGAL_DIR, 'versions.json'), 'utf8'));

function splitFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('нет front-matter');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z]+):\s*(.+)$/.exec(line.trim());
    if (pair) fields[pair[1]] = pair[2].trim();
  }
  return { fields, body: match[2].trim() };
}

/** Экранирование для HTML — тексты пишем мы, но подстановка без экранирования
 * в генераторе однажды встретит документ с `<` и превратит его в разметку. */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const documents = [];
for (const doc of registry.documents) {
  const raw = readFileSync(join(LEGAL_DIR, doc.file), 'utf8');
  const { fields, body } = splitFrontMatter(raw);
  const current = doc.history[doc.history.length - 1];
  documents.push({
    id: doc.id,
    title: fields.title,
    version: current.version,
    effectiveDate: current.effectiveDate,
    sha256: current.sha256,
    status: doc.status,
    body,
  });
}

const ts =
  `// СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не редактировать руками.\n` +
  `// Источник — docs/legal/*.md + docs/legal/versions.json.\n` +
  `// Пересобрать: node scripts/build-legal.mjs\n` +
  `import type { LegalDocument } from './index.js';\n\n` +
  `export const LEGAL_DOCUMENTS: readonly LegalDocument[] = ${JSON.stringify(documents, null, 2)};\n`;

/** Статическая страница: тот же текст, без сборщика и без зависимостей —
 * её обязан открывать и робот магазина, и человек по прямой ссылке. */
function htmlPage(doc) {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(doc.title)} — ШАГИ</title>
    <style>
      body { margin: 0 auto; padding: 32px 20px 64px; max-width: 46rem; font: 16px/1.6 system-ui, sans-serif; color: #16181d; background: #fff; }
      @media (prefers-color-scheme: dark) { body { color: #e9ebf0; background: #16181d; } }
      h1 { font-size: 1.6rem; } h2 { font-size: 1.2rem; margin-top: 2rem; }
      code { font-family: ui-monospace, monospace; font-size: 0.9em; }
      .meta { opacity: 0.75; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <p class="meta">Версия ${escapeHtml(doc.version)} от ${escapeHtml(doc.effectiveDate)} · SHA-256 <code>${escapeHtml(doc.sha256)}</code></p>
    <pre style="white-space: pre-wrap; font: inherit">${escapeHtml(doc.body)}</pre>
  </body>
</html>
`;
}

const outputs = [[GENERATED_TS, ts]];
for (const doc of documents) outputs.push([join(WEB_DIR, `${doc.id}.html`), htmlPage(doc)]);

let stale = 0;
for (const [path, content] of outputs) {
  let existing = null;
  try {
    existing = readFileSync(path, 'utf8');
  } catch {
    existing = null;
  }
  if (existing === content) continue;
  stale += 1;
  if (checkOnly) {
    process.stderr.write(`build-legal: ${path} устарел относительно docs/legal/\n`);
    continue;
  }
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, content);
  process.stdout.write(`build-legal: записан ${path}\n`);
}

if (checkOnly && stale > 0) {
  process.stderr.write('build-legal: пересоберите — node scripts/build-legal.mjs\n');
  process.exit(1);
}
process.stdout.write(
  `build-legal: ${checkOnly ? 'всё актуально' : 'готово'} (${outputs.length} файлов)\n`,
);
