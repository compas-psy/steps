import type { OccurrenceSeq, OwnerScope } from '../values.js';

/**
 * Заделы на правила 29, 30, 31 (`02§11.1`, `02§13`) — форма контракта для
 * будущих пакетов работ, **не** реализация. Ни одна функция этого модуля не
 * вызывается из `validate.ts`/`task.ts`/остальных валидаторов пакета
 * E01.3 — вызывать их сейчас неоткуда и незачем, оба владеющих слоя ещё не
 * существуют:
 *
 *  - правило 29 (ownership/scope входящей sync-мутации) — выполнить нечем:
 *    в системе ещё нет ни транспорта, ни аутентифицированной сессии, чей
 *    `owner_scope` можно было бы сравнить с `owner_scope` записи. Владелец —
 *    будущий пакет `@shagi/sync`;
 *  - правила 30/31 (remove-wins граница `stop_after_occurrence_seq` и
 *    `template_revision` reconciliation) — относятся к движку слияния
 *    повторов, эпик E11. Написать эту логику здесь означало бы угадывать
 *    контракт слияния (что в этот момент значит "текущая" граница при
 *    конкурентных писателях, как remove-wins взаимодействует с per-field
 *    HLC остальных полей occurrence) раньше, чем появится код, который его
 *    реально использует — рискованнее, чем оставить точку подключения
 *    объявленной, но пустой.
 *
 * Каждая функция ниже намеренно бросает при вызове — это не "заглушка,
 * которая молча ничего не проверяет" (такая давала бы ложное чувство
 * покрытия), а явный сигнал "сюда ещё не провели проводку". Тесты
 * (`test/validation/sync-stubs.test.ts`) фиксируют именно это поведение.
 */

// --- Правило 29: ownership/scope входящей sync-мутации ----------------------

export interface OwnershipCheckContext {
  /** `owner_scope`, под которым выполняется входящая мутация (из
   * аутентифицированной sync-сессии — слой ещё не существует). */
  readonly requestOwnerScope: OwnerScope;
  /** `owner_scope`, которым фактически владеет затрагиваемая запись. */
  readonly entityOwnerScope: OwnerScope;
}

/**
 * Точка подключения правила 29. Ожидаемый будущий код ошибки —
 * `PERMISSION_DENIED` (уже объявлен в `error-codes.ts`, переиспользован из
 * `03§19`) при `requestOwnerScope !== entityOwnerScope`.
 */
export function validateOwnership(_context: OwnershipCheckContext): never {
  throw new Error(
    'Правило 29 (ownership/scope входящей sync-мутации, `02§11.1`) не реализовано в пакете работ ' +
      'E01.3: выполнить проверку нечем — sync-слой (аутентифицированная сессия, транспорт) ещё не ' +
      'существует. Это объявленная точка подключения для будущего @shagi/sync, не рабочая проверка.',
  );
}

// --- Правила 30/31: слияние повторов (эпик E11) ------------------------------

/** Форма, которую движку повторов понадобится сравнить с предлагаемым
 * `occurrenceSeq`, чтобы решить remove-wins (правило 30, `02§13`). */
export interface SeriesDeleteBoundaryContext {
  readonly stopAfterOccurrenceSeq: OccurrenceSeq | null;
}

/**
 * Точка подключения правила 30. Ожидаемый будущий код ошибки —
 * `SYNC_CONFLICT`. Сама граница мержится по max/remove-wins и не может быть
 * понижена устаревшим клиентом (`02§13`) — это уже семантика merge-слоя
 * E11, не одной локальной проверки "больше/меньше", поэтому здесь не
 * реализован даже кажущийся тривиальным `occurrenceSeq > stopAfterOccurrenceSeq`.
 */
export function validateSeriesDeleteBoundary(
  _occurrenceSeq: OccurrenceSeq,
  _context: SeriesDeleteBoundaryContext,
): never {
  throw new Error(
    'Правило 30 (remove-wins граница stop_after_occurrence_seq, `02§13`) не реализовано в пакете ' +
      'работ E01.3: относится к движку повторов, эпик E11. Это объявленная точка подключения, не ' +
      'рабочая проверка.',
  );
}

/** Форма контекста для reconciliation при получении более новой правки
 * "Вся серия" (правило 31, `02§13`). */
export interface TemplateRevisionReconciliationContext {
  readonly templateRevision: bigint;
  readonly appliedTemplateRevision: bigint;
  /** Поля, зафиксированные как `override_fields` для этого occurrence —
   * они не реконсилируются к новому шаблону. */
  readonly overrideFields: readonly string[];
}

/**
 * Точка подключения правила 31. Ожидаемый будущий код ошибки —
 * `SYNC_CONFLICT`. Завершённая/пропущенная история неизменяема (`01§11.8.1`)
 * — это тоже забота движка E11, не одной функции сравнения ревизий.
 */
export function validateTemplateRevisionReconciliation(
  _context: TemplateRevisionReconciliationContext,
): never {
  throw new Error(
    'Правило 31 (template_revision reconciliation, `02§13`) не реализовано в пакете работ E01.3: ' +
      'относится к движку повторов, эпик E11. Это объявленная точка подключения, не рабочая проверка.',
  );
}
