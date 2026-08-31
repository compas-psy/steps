import { Temporal } from '@js-temporal/polyfill';

/**
 * "Date shortcut semantics" (`01_PRODUCT_BEHAVIOR_R1.md` §5, §4) — арифметика
 * двух шорткатов, общая для NLP-разбора (`@shagi/nlp`) и UI-редактора Planned
 * Date (пакет работ E08.2, `packages/app/src/screens/TaskDetail.tsx`).
 *
 * **Перенесено из `@shagi/nlp/src/internal/temporal-rules.ts`** (пакет работ
 * E08.2): те же функции, буквально та же логика, только не `internal/` —
 * `packages/nlp` не экспортировал их из публичной точки входа `@shagi/nlp`
 * (только для собственных matcher'ов), значит для UI-редактора не было
 * законного пути их получить, а писать вторую копию этой арифметики в
 * `packages/app` значило бы завести два места, которые обязаны совпадать по
 * `01§5` буквально, но ничем не связаны кодом. `packages/nlp` уже зависит от
 * `@shagi/core` (`package.json`), поэтому перенос сюда не создаёт цикл;
 * `packages/nlp/src/internal/temporal-rules.ts` теперь тонко реэкспортирует
 * эти два имени отсюда — существующие matcher'ы (`matchers/date.ts` и
 * соседние) продолжают импортировать из старого пути без изменений.
 *
 * «Сегодня»/«Завтра» не заведены отдельными функциями — это `today`/
 * `today.add({days:1})` без содержательной арифметики, вызывающий код
 * (`TaskDetail.tsx`) собирает их на месте.
 */

/**
 * "Выходные → today if Saturday/Sunday, otherwise nearest Saturday" — если
 * сегодня уже выходной, "выходные" значит именно сегодня, а не следующую
 * субботу.
 */
export function resolveWeekend(today: Temporal.PlainDate): Temporal.PlainDate {
  const dow = today.dayOfWeek;
  if (dow === 6 || dow === 7) {
    return today;
  }
  const daysUntilSaturday = 6 - dow;
  return today.add({ days: daysUntilSaturday });
}

/** "Следующая неделя → next Monday, never current Monday" — даже если
 * сегодня понедельник, результат на 7 дней вперёд, а не сегодня. */
export function resolveNextWeekMonday(today: Temporal.PlainDate): Temporal.PlainDate {
  const dow = today.dayOfWeek;
  const daysUntilMonday = (8 - dow) % 7 || 7;
  return today.add({ days: daysUntilMonday });
}
