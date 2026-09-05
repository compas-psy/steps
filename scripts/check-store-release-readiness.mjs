/**
 * Готовность выпуска к ПУБЛИКАЦИИ — не к сборке.
 *
 * Разделение принципиальное и продиктовано владельцем: юридический
 * `status: draft` обязан блокировать отгрузку в магазин и публикацию
 * релиза, но НЕ сборку артефактов. Собранный `.aab`, который нельзя
 * отгрузить, — нормальное состояние: он нужен, чтобы проверять сам
 * конвейер сборки, пока юристы и реквизиты в работе. Опубликованный
 * релиз с черновой политикой конфиденциальности — не нормальное:
 * Google Play требует действующую политику, а пользователь читает то,
 * что опубликовано.
 *
 * Поэтому этот скрипт вызывается ТОЛЬКО из шага публикации
 * (`build-android.yml`, job `release`), и никогда — из сборочного job.
 *
 * Что проверяется:
 *
 *  1. оба документа `05§14` имеют `status: final` — то есть реквизиты
 *     владельца подставлены и юридическая проверка пройдена (сам факт
 *     проверки фиксирует владелец, переводя статус; скрипт не может её
 *     выполнить и не притворяется, что может);
 *  2. в текстах не осталось незаполненных подстановок `{{...}}`.
 *
 * Чего он НЕ делает: не судит о содержании документов и не заменяет
 * юриста. `status: final` — это подпись владельца под тем, что проверка
 * была, а не вывод скрипта.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEGAL_DIR = 'docs/legal';
const PLACEHOLDER = /\{\{[A-Z_]+\}\}/g;

const registry = JSON.parse(readFileSync(join(LEGAL_DIR, 'versions.json'), 'utf8'));
const blockers = [];

for (const doc of registry.documents) {
  const text = readFileSync(join(LEGAL_DIR, doc.file), 'utf8');
  const placeholders = [...new Set(text.match(PLACEHOLDER) ?? [])];

  if (doc.status !== 'final') {
    blockers.push(
      `${doc.file}: status=${doc.status}, требуется final` +
        (placeholders.length > 0 ? ` (не заполнено: ${placeholders.join(', ')})` : ''),
    );
    continue;
  }
  if (placeholders.length > 0) {
    blockers.push(`${doc.file}: status=final, но остались подстановки ${placeholders.join(', ')}`);
  }
}

if (blockers.length > 0) {
  process.stderr.write(
    'check-store-release-readiness: ПУБЛИКАЦИЯ ЗАБЛОКИРОВАНА\n\n' +
      `${blockers.map((line) => `  • ${line}`).join('\n')}\n\n` +
      'Юридические документы не готовы к публикации. Что нужно — ' +
      'docs/legal/OWNER-INPUT-REQUIRED.md:\n' +
      '  1. подставить реквизиты владельца вместо {{...}};\n' +
      '  2. пройти юридическую проверку;\n' +
      '  3. перевести status в final в docs/legal/versions.json.\n\n' +
      'Сборка артефактов этим НЕ блокируется: .apk и .aab собраны и лежат ' +
      'во вкладке Actions — заблокирована только публикация.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `check-store-release-readiness: чисто — документов: ${registry.documents.length}, ` +
    'все final, подстановок не осталось.\n',
);
