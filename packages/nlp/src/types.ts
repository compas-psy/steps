/**
 * Публичные типы `@shagi/nlp` (`01§4`, конспект §6, пакет работ E05.1).
 *
 * Выход парсера — не мутация домена и не черновик `CreateTaskCommand`
 * (следующий пакет работ его строит из этой структуры), а чистое описание
 * разбора: что было распознано, с каким вычисленным значением, из какого
 * диапазона исходного текста, и что было отклонено. UI (`packages/app`,
 * другой эпик) сам решает, что показать и как обработать accept/reject/edit
 * — здесь только форма данных, которая это выражает (шаг 8 конвейера).
 */

import type { DurationMinutes, Priority } from '@shagi/core';
import type { Temporal } from '@js-temporal/polyfill';

/** Текущий момент, переданный вызывающей стороной (Composer). Даты/время —
 * плавающие локальные (`Temporal.PlainDate`/`PlainTime`), как и везде в
 * домене (`01§5`) — парсер не работает с `Instant`/`ZonedDateTime` напрямую,
 * зона нужна только чтобы её эхом пронести дальше по конвейеру (создание
 * задачи, планирование уведомлений), сам парсер зоны не использует. */
export interface NowContext {
  readonly date: Temporal.PlainDate;
  readonly time: Temporal.PlainTime;
  readonly timeZone: string;
}

/**
 * Унаследованный контекст Composer (`01§4`: "если Composer уже был открыт
 * из Today/Plan с контекстом"). Из всей грамматики на это влияет только
 * унаследованная дата — правило "Time-only без даты" присоединяет явно
 * написанное время к ней вместо вычисления Today/Tomorrow. Унаследованный
 * проект на разбор текста не влияет (`#tag` парсится одинаково независимо
 * от того, из какого проекта открыт Composer) — это забота командного слоя
 * (следующий пакет работ), не NLP.
 */
export interface InheritedContext {
  readonly date?: Temporal.PlainDate;
}

export interface ParseQuickAddInput {
  readonly text: string;
  readonly now: NowContext;
  readonly inherited?: InheritedContext;
}

// --- Диапазон исходного текста ----------------------------------------------

/**
 * Индексы — по UTF-16 code units нормализованного (NFKC) текста, как и
 * везде в JS-строках (`string.slice`, `.length`). Для реалистичного ввода
 * Quick Add (кириллица, латиница, цифры, обычная пунктуация) NFKC —
 * идемпотентная операция, не меняющая длину строки, так что диапазон
 * совпадает с диапазоном в исходном "сыром" тексте пользователя; проверено
 * в `test/normalize.test.ts`. Экзотические composed-формы (лигатуры,
 * full-width варианты), для которых это не так, в реальном Quick Add не
 * встречаются — сознательное упрощение, не баг.
 */
export interface SourceSpan {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

// --- Категории грамматики (`01§4`) ------------------------------------------

export type ChipCategory =
  | 'date'
  | 'weekday'
  | 'time'
  | 'deadline'
  | 'duration'
  | 'recurrence'
  | 'project'
  | 'label'
  | 'priority';

/** Откуда взялось вычисленное значение чипа — различие важно для UI:
 * `explicit` можно отклонить (текст восстановится), `inherited`/`implied`
 * не имеют исходного текста (`span === null`) и представляют правило
 * "никогда не угадывать молча" (`01§4`: итоговый Date-чип показывается
 * явно, даже когда дата не была написана пользователем). */
export type ChipOrigin = 'explicit' | 'inherited' | 'implied';

export interface DateChipValue {
  readonly date: Temporal.PlainDate;
}

export interface TimeChipValue {
  readonly time: Temporal.PlainTime;
}

/** `dateOrigin` — как вычислена дата дедлайна, когда в тексте было только
 * время (`01§4`: "Time-only Deadline использует то же правило Today/
 * Tomorrow"). Не часть публичного контракта чипов других категорий —
 * только у дедлайна дата и время всегда живут в одном чипе и могут иметь
 * разное происхождение одновременно (время явно написано, дата — нет). */
export interface DeadlineChipValue {
  readonly date: Temporal.PlainDate;
  readonly time: Temporal.PlainTime | null;
  readonly dateOrigin: ChipOrigin;
}

export interface DurationChipValue {
  readonly minutes: DurationMinutes;
}

export type RecurrenceUnit = 'day' | 'week' | 'month';

/**
 * RRULE-подобное, но не RRULE: только то, что нужно, чтобы описать шесть
 * форм грамматики `01§4` одной структурой без выдумывания собственного
 * мини-языка. Генерация occurrence-повторов из этого — эпик E11, здесь
 * только извлечение параметров правила (граница из ТЗ пакета работ).
 */
export interface RecurrenceChipValue {
  readonly unit: RecurrenceUnit;
  readonly interval: number;
  /** ISO-номера дня недели (1=понедельник..7=воскресенье), когда правило
   * называет конкретные дни ("по будням", "каждый понедельник"). */
  readonly byWeekday?: readonly number[];
  /** День месяца 1..31, для "каждое N число". */
  readonly byMonthDay?: number;
}

export interface ProjectChipValue {
  readonly name: string;
}

export interface LabelChipValue {
  readonly name: string;
}

export interface PriorityChipValue {
  readonly priority: Priority;
}

export interface ChipValueByCategory {
  date: DateChipValue;
  weekday: DateChipValue;
  time: TimeChipValue;
  deadline: DeadlineChipValue;
  duration: DurationChipValue;
  recurrence: RecurrenceChipValue;
  project: ProjectChipValue;
  label: LabelChipValue;
  priority: PriorityChipValue;
}

/**
 * Принятый чип (шаг 7 конвейера). `span === null` только для чипов даты,
 * синтезированных правилом Today/Tomorrow или унаследованного контекста
 * (`origin !== 'explicit'`) — они не породили никакого текста, который
 * можно было бы вычистить из заголовка или подсветить в исходном вводе.
 */
export interface AcceptedChip<C extends ChipCategory = ChipCategory> {
  readonly decision: 'accepted';
  readonly category: C;
  readonly span: SourceSpan | null;
  readonly value: ChipValueByCategory[C];
  readonly origin: ChipOrigin;
}

export type AnyAcceptedChip = { [C in ChipCategory]: AcceptedChip<C> }[ChipCategory];

/**
 * Причина отклонения (шаг 5 конвейера, "детерминированный precedence"):
 * - `invalidDate` — синтаксически похоже на дату, но не существует
 *   (30 февраля) — temporal-валидация (шаг 6) провалилась;
 * - `overlapLostPrecedence` — пересеклось по диапазону символов с
 *   кандидатом более высокого приоритета и проиграло;
 * - `ambiguousReading` — не пересекается по символам, но конкурирует за тот
 *   же однозначный слот задачи (например, второе упоминание даты или
 *   времени в одном тексте — у задачи может быть только одна Planned Date).
 */
export type RejectionReason = 'invalidDate' | 'overlapLostPrecedence' | 'ambiguousReading';

/**
 * Отклонённый/неоднозначный кандидат. Намеренно без `value` — "никогда не
 * угадывать молча" (`01§4`) означает, что для того, что не было принято,
 * парсер не выставляет наружу никакого вычисленного значения вообще, даже
 * ошибочного; `span.text` — точный исходный текст, который UI покажет
 * отдельно и восстановит в заголовке при явном отклонении принятого чипа
 * (это состояние — уже `packages/app`, здесь лишь сырой текст для этого).
 */
export interface RejectedCandidate<C extends ChipCategory = ChipCategory> {
  readonly decision: 'rejected';
  readonly category: C;
  readonly span: SourceSpan;
  readonly reason: RejectionReason;
}

export type AnyRejectedCandidate = { [C in ChipCategory]: RejectedCandidate<C> }[ChipCategory];

/**
 * Заголовок после разбора (шаг 9, решение `?10`). `readable`/`length`
 * делегированы `@shagi/core` (`hasReadableContent`/`unicodeLength`) —
 * единый источник правила 14 для локальных мутаций, sync-патчей и NLP.
 * Сама блокировка сохранения — дело валидатора (`validateTask`), не этого
 * пакета: `readable === false` лишь делает факт представимым для того, кто
 * вызовет валидатор дальше по цепочке.
 */
export interface TitleResult {
  readonly text: string;
  readonly readable: boolean;
  readonly length: number;
}

export interface ParseQuickAddResult {
  readonly title: TitleResult;
  readonly chips: readonly AnyAcceptedChip[];
  readonly rejected: readonly AnyRejectedCandidate[];
}
