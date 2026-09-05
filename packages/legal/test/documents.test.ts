import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEGAL_DOCUMENTS } from '../src/index.js';

/**
 * `05§14` требует отдельных НЕИЗМЕНЯЕМЫХ версий и хешей для
 * Пользовательского соглашения и Политики конфиденциальности.
 *
 * Эти тесты проверяют то, что видно из приложения: документ, который
 * покажут человеку, — тот же самый файл, что лежит в `docs/legal/`, той же
 * версии и с тем же хешем. Расхождение здесь означает, что приложение
 * показывает одно, а опубликовано другое, — ровно тот класс ошибки, ради
 * которого спека и требует хеши.
 */
const LEGAL_DIR = join(import.meta.dirname, '../../../docs/legal');
const registry = JSON.parse(readFileSync(join(LEGAL_DIR, 'versions.json'), 'utf8')) as {
  documents: Array<{
    id: string;
    file: string;
    status: string;
    history: Array<{ version: string; effectiveDate: string; sha256: string }>;
  }>;
};

describe('@shagi/legal — документы из бандла соответствуют исходникам', () => {
  it('в бандле ровно те же документы, что в реестре версий', () => {
    expect(LEGAL_DOCUMENTS.map((doc) => doc.id).toSorted()).toEqual(
      registry.documents.map((doc) => doc.id).toSorted(),
    );
  });

  it('оба обязательных документа присутствуют (05§14: они отдельные, не один)', () => {
    expect(LEGAL_DOCUMENTS.map((doc) => doc.id).toSorted()).toEqual([
      'privacy-policy',
      'user-agreement',
    ]);
  });

  for (const entry of registry.documents) {
    const current = entry.history[entry.history.length - 1]!;

    it(`${entry.id}: версия и хеш в бандле совпадают с реестром`, () => {
      const bundled = LEGAL_DOCUMENTS.find((doc) => doc.id === entry.id);
      expect(bundled).toBeDefined();
      expect(bundled?.version).toBe(current.version);
      expect(bundled?.sha256).toBe(current.sha256);
      expect(bundled?.effectiveDate).toBe(current.effectiveDate);
    });

    it(`${entry.id}: хеш реестра — настоящий sha256 файла`, () => {
      const actual = createHash('sha256')
        .update(readFileSync(join(LEGAL_DIR, entry.file)))
        .digest('hex');
      expect(actual).toBe(current.sha256);
    });

    it(`${entry.id}: текст в бандле непустой и не обрезан`, () => {
      const bundled = LEGAL_DOCUMENTS.find((doc) => doc.id === entry.id);
      // Нижняя граница грубая намеренно: она ловит пустую строку и
      // обрезанный генератором текст, но не превращается в проверку
      // «документ такой же длины, как вчера», которую пришлось бы
      // править при каждой редактуре.
      expect(bundled?.body.length ?? 0).toBeGreaterThan(1000);
    });
  }
});

/**
 * Обещаний, которых в `MVP 1.0-local` нет (ADR-0009), быть не должно ни в
 * одном документе. Проверка не косметическая: обещание облачного
 * восстановления в политике — это обязательство, которого продукт не
 * выполнит, и худший вид неправды в юридическом тексте.
 */
describe('документы не обещают того, чего в MVP 1.0-local нет', () => {
  /** Слово ищется как обещание, а не как отрицание: тексты ОБЯЗАНЫ
   * говорить «облачного восстановления нет», поэтому запрещены не сами
   * слова, а утвердительные конструкции с ними. */
  const forbidden: ReadonlyArray<readonly [string, RegExp]> = [
    ['обещание синхронизации', /(мы|приложение)\s+синхронизирует/i],
    ['обещание облачной копии', /(храним|хранится)\s+(в|на)\s+(облак|наших серверах)/i],
    ['обещание аккаунта', /(создайте|создать)\s+(учётную запись|аккаунт)/i],
    ['сбор аналитики', /мы\s+собираем\s+(аналитик|статистик|данные о)/i],
  ];

  for (const doc of LEGAL_DOCUMENTS) {
    for (const [what, pattern] of forbidden) {
      it(`${doc.id}: нет конструкции «${what}»`, () => {
        expect(pattern.test(doc.body), `${doc.id}: найдено «${what}»`).toBe(false);
      });
    }
  }
});

/**
 * Веб-версия для магазина и версия в приложении обязаны совпадать
 * дословно. Совпадение обеспечено построением — оба артефакта порождает
 * `scripts/build-legal.mjs` из одного `.md`, — но проверяется всё равно:
 * «по построению» перестаёт быть правдой ровно в тот день, когда кто-то
 * поправит статическую страницу руками.
 */
describe('веб-версии документов не расходятся с версией в приложении', () => {
  const WEB_DIR = join(import.meta.dirname, '../../../apps/web/public/legal');

  for (const doc of LEGAL_DOCUMENTS) {
    it(`${doc.id}: страница для магазина несёт тот же текст, версию и хеш`, () => {
      const html = readFileSync(join(WEB_DIR, `${doc.id}.html`), 'utf8');
      expect(html).toContain(doc.sha256);
      expect(html).toContain(doc.version);
      // Тело сравнивается по содержательному фрагменту, а не целиком:
      // в HTML оно экранировано, и посимвольное равенство сравнивало бы
      // экранирование, а не текст.
      const probe = doc.body
        .split('\n')
        .find((line) => line.length > 40)
        ?.trim();
      expect(probe, 'в документе не нашлось строки для сверки').toBeDefined();
      expect(html).toContain(probe!.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    });
  }
});
