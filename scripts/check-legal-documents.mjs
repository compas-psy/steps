/**
 * Гейт юридических документов (`05§14`: отдельные неизменяемые версии и
 * хеши User Agreement и Privacy Policy).
 *
 * Что проверяется:
 *
 *  1. фактический sha256 каждого файла совпадает с хешем ПОСЛЕДНЕЙ записи
 *     в `docs/legal/versions.json` — изменил текст и не добавил версию,
 *     гейт красный;
 *  2. версии и хеши внутри истории документа уникальны — одна версия не
 *     может означать два разных текста;
 *  3. front-matter документа (`version`, `id`) не разошёлся с реестром —
 *     иначе приложение показало бы одну версию, а реестр фиксировал бы
 *     другую;
 *  4. документ со `status: final` не содержит незаполненных подстановок
 *     `{{TOKEN}}` — публиковать документ с «{{OWNER_LEGAL_NAME}}» нельзя.
 *
 * Чего этот гейт НЕ ловит, честно: если изменить текст И переписать хеш
 * последней записи, не добавляя новую версию, проверка пройдёт. Отличить
 * это от легитимного выпуска новой редакции можно только по истории git,
 * и такое сравнение здесь не делается — вместо ложного чувства защиты об
 * этом сказано прямо. Ревью изменений в `docs/legal/` обязательно.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEGAL_DIR = 'docs/legal';
const REGISTRY = join(LEGAL_DIR, 'versions.json');
const PLACEHOLDER = /\{\{[A-Z_]+\}\}/g;

const problems = [];
const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));

/** Читает front-matter документа — только те поля, что сверяются с реестром. */
function readFrontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z]+):\s*(.+)$/.exec(line.trim());
    if (pair) fields[pair[1]] = pair[2].trim();
  }
  return fields;
}

for (const doc of registry.documents) {
  const path = join(LEGAL_DIR, doc.file);
  const raw = readFileSync(path);
  const actual = createHash('sha256').update(raw).digest('hex');
  const history = doc.history;
  const current = history[history.length - 1];

  if (actual !== current.sha256) {
    problems.push(
      `${doc.file}: текст изменён, но версия не выпущена.\n` +
        `    фактический sha256: ${actual}\n` +
        `    в реестре (${current.version}): ${current.sha256}\n` +
        '    Добавьте НОВУЮ запись в history с новой версией и этим хешем.',
    );
  }

  const versions = history.map((entry) => entry.version);
  if (new Set(versions).size !== versions.length) {
    problems.push(`${doc.file}: версии в history повторяются — ${versions.join(', ')}`);
  }
  const hashes = history.map((entry) => entry.sha256);
  if (new Set(hashes).size !== hashes.length) {
    problems.push(`${doc.file}: один и тот же хеш числится за разными версиями`);
  }

  const text = raw.toString('utf8');
  const front = readFrontMatter(text);
  if (front === null) {
    problems.push(`${doc.file}: нет front-matter с id/version`);
  } else {
    if (front.id !== doc.id) {
      problems.push(`${doc.file}: id в документе (${front.id}) ≠ id в реестре (${doc.id})`);
    }
    if (front.version !== current.version) {
      problems.push(
        `${doc.file}: version в документе (${front.version}) ≠ последней версии реестра (${current.version})`,
      );
    }
  }

  const placeholders = [...new Set(text.match(PLACEHOLDER) ?? [])];
  if (doc.status === 'final' && placeholders.length > 0) {
    problems.push(
      `${doc.file}: status=final, но остались незаполненные подстановки: ${placeholders.join(', ')}`,
    );
  }
  if (doc.status === 'draft' && placeholders.length > 0) {
    process.stdout.write(
      `check-legal-documents: ${doc.file} — черновик, ждёт реквизитов владельца: ${placeholders.join(', ')}\n` +
        '  (список — docs/legal/OWNER-INPUT-REQUIRED.md; публиковать в таком виде нельзя)\n',
    );
  }
}

if (problems.length > 0) {
  process.stderr.write(`check-legal-documents: НАРУШЕНИЯ\n\n${problems.join('\n\n')}\n`);
  process.exit(1);
}

process.stdout.write(
  `check-legal-documents: чисто — документов: ${registry.documents.length}, ` +
    'хеши совпадают с реестром версий.\n',
);
