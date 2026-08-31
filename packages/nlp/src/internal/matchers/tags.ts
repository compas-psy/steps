/**
 * Категории Project (`#имя`), Label (`@имя`), Priority (`!1`..`!4`,
 * `01§4`) — три маленьких, независимых токена, не связанных с temporal-
 * грамматикой, вынесены в один файл.
 *
 * Имя проекта/метки сохраняет регистр, как набрал пользователь: матчинг
 * идёт по lowercase-тексту (единообразно со всеми матчерами), но значение
 * вырезается из `ctx.originalText` по тем же индексам.
 */

import { makePriority } from '@shagi/core';

import type { LabelChipValue, PriorityChipValue, ProjectChipValue } from '../../types.js';
import type { PatternDef } from '../candidates.js';
import { WORD_BOUNDARY_BEFORE } from '../text.js';

/** `\p{L}\p{N}_-` — буквы (кириллица/латиница без хардкода алфавита),
 * цифры, подчёркивание, дефис. */
const NAME_BODY = '[\\p{L}\\p{N}_-]+';

export const PROJECT_PATTERNS: readonly PatternDef<ProjectChipValue>[] = [
  {
    // Граница слева обязательна — иначе `user@example.com` читался бы как
    // метка `example` (`@` там предшествует буква `r`, не начало слова).
    // Символ `#`/`@` сам по себе не "буквенный", но то, что перед ним,
    // может им быть.
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}#(${NAME_BODY})`, 'uy'),
    resolve: (m, ctx) => {
      const start = m.index + 1;
      const name = ctx.originalText.slice(start, start + (m[1] as string).length);
      return { kind: 'valid', value: { name } };
    },
  },
];

export const LABEL_PATTERNS: readonly PatternDef<LabelChipValue>[] = [
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}@(${NAME_BODY})`, 'uy'),
    resolve: (m, ctx) => {
      const start = m.index + 1;
      const name = ctx.originalText.slice(start, start + (m[1] as string).length);
      return { kind: 'valid', value: { name } };
    },
  },
];

export const PRIORITY_PATTERNS: readonly PatternDef<PriorityChipValue>[] = [
  {
    regex: new RegExp(`${WORD_BOUNDARY_BEFORE}!([1-4])(?!\\d)`, 'uy'),
    resolve: (m) => ({ kind: 'valid', value: { priority: makePriority(Number(m[1])) } }),
  },
];
