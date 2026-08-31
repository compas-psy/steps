import { Temporal } from '@js-temporal/polyfill';

import type { Reminder } from '../entities/reminder.js';
import { generateUuidV7 } from '../identity/index.js';
import { effectiveDeadlineDateTime } from '../temporal/deadline.js';
import type { Uuid } from '../values.js';
import type { ReminderCommandDeps } from './reminder-port.js';
import { writeReminder } from './reminder-write.js';

/** 09:00 — момент "начала дня" для date-only дедлайнов (`01§18`: "date-only
 * → 09:00 deadline day" / "09:00 next day"). Локальная константа этого
 * файла — намеренно НЕ импортирована из `temporal/deadline.ts`, у той свой
 * `END_OF_DAY` (23:59:59.999, конец суток для "эффективного дедлайна"),
 * другое число с другим смыслом. */
const NINE_AM = Temporal.PlainTime.from('09:00');

/** Порог "уже слишком поздно предупреждать" (`01§18`: "too-close cases do
 * not fire immediate spam") — часов до эффективного timed-дедлайна. Ровно 2ч
 * — ещё too-close (проверено адверсариально, см. отчёт пакета работ). */
const TOO_CLOSE_HOURS = 2;

/** Порог "дедлайн ещё далеко" — часов до эффективного timed-дедлайна, после
 * которого напоминание ставится за 24ч до дедлайна, а не за 1ч. Ровно 24ч —
 * ещё "далеко" (граница включительна, см. тест на этой границе). */
const FAR_AWAY_HOURS = 24;

/** Общий вход обеих deadline-команд — снимок дедлайна задачи на момент
 * вызова, не читается из хранилища заново (то же соображение, что у
 * остальных команд этого пакета работ). */
interface DeadlineReminderInput {
  readonly taskId: Uuid;
  readonly deadlineDate: Temporal.PlainDate | null;
  readonly deadlineTime: Temporal.PlainTime | null;
}

export interface CreateDeadlineApproachingReminderInput extends DeadlineReminderInput {}
export interface CreateDeadlineMissedReminderInput extends DeadlineReminderInput {}

/**
 * Итог `createDeadlineApproachingReminderCommand`. Три исхода — не два:
 * помимо обычного успеха, `01§18` различает "нечего вычислять" (нет
 * дедлайна — `invalid_input`, некорректный вход) и "рано ещё, но уже
 * слишком поздно предупреждать" (`too-close`, `01§18`: "do not fire
 * immediate spam") — намеренно НЕ ошибка (вход корректен, просто для него
 * нет уместного момента напоминания), а осознанное отсутствие действия:
 * задание явно требует различать эти два случая в форме ответа, не сводить
 * оба к отказу.
 */
export type CreateDeadlineApproachingReminderResult =
  | { readonly status: 'ok'; readonly reminder: Reminder }
  | { readonly status: 'invalid_input'; readonly reason: 'missing_deadline' }
  | { readonly status: 'skipped'; readonly reason: 'too_close' };

/** Итог `createDeadlineMissedReminderCommand` — `01§18` не описывает
 * too-close случай для missed (правило безусловно: "+15 мин"/"09:00
 * следующего дня"), поэтому здесь только два исхода. */
export type CreateDeadlineMissedReminderResult =
  | { readonly status: 'ok'; readonly reminder: Reminder }
  | { readonly status: 'invalid_input'; readonly reason: 'missing_deadline' };

/** `localRuleJson`, общий по форме для обоих deadline-видов (см.
 * `reminder-explicit.ts` про единое поле `firesAt` во всех трёх видах) —
 * снимок входных данных дедлайна плюс разрешённый момент срабатывания.
 * `offsetHours` — только для `deadline_approaching`/timed (24 либо 1) —
 * убирает необходимость заново вычитать `firesAt` из `deadlineDate`/`Time`,
 * чтобы понять, какое именно правило сработало. */
function buildDeadlineLocalRuleJson(
  kind: 'deadline_approaching' | 'deadline_missed',
  deadlineDate: Temporal.PlainDate,
  deadlineTime: Temporal.PlainTime | null,
  firesAt: Temporal.PlainDateTime,
  offsetHours: 24 | 1 | null,
): Readonly<Record<string, unknown>> {
  return {
    kind,
    deadlineDate: deadlineDate.toString(),
    deadlineTime: deadlineTime === null ? null : deadlineTime.toString(),
    offsetHours,
    firesAt: firesAt.toString(),
  };
}

export async function createDeadlineApproachingReminderCommand(
  input: CreateDeadlineApproachingReminderInput,
  deps: ReminderCommandDeps,
): Promise<CreateDeadlineApproachingReminderResult> {
  if (input.deadlineDate === null) {
    return { status: 'invalid_input', reason: 'missing_deadline' };
  }
  const deadlineDate = input.deadlineDate;

  let firesAt: Temporal.PlainDateTime;
  let offsetHours: 24 | 1 | null;

  if (input.deadlineTime === null) {
    // date-only → 09:00 дня дедлайна, безусловно (`01§18`).
    firesAt = deadlineDate.toPlainDateTime(NINE_AM);
    offsetHours = null;
  } else {
    const effective = effectiveDeadlineDateTime(deadlineDate, input.deadlineTime);
    const hoursUntil = deps.nowLocal.until(effective, { largestUnit: 'hours' }).total('hours');

    if (hoursUntil <= TOO_CLOSE_HOURS) {
      // "too-close cases do not fire immediate spam" — осознанно не создаём
      // напоминание вовсе (не ошибка, см. JSDoc результата).
      return { status: 'skipped', reason: 'too_close' };
    }
    if (hoursUntil >= FAR_AWAY_HOURS) {
      firesAt = effective.subtract({ hours: 24 });
      offsetHours = 24;
    } else {
      firesAt = effective.subtract({ hours: 1 });
      offsetHours = 1;
    }
  }

  const generateId = deps.generateId ?? generateUuidV7;
  const reminder: Reminder = {
    id: generateId(),
    taskId: input.taskId,
    kind: 'deadline_approaching',
    localRuleJson: buildDeadlineLocalRuleJson(
      'deadline_approaching',
      deadlineDate,
      input.deadlineTime,
      firesAt,
      offsetHours,
    ),
    enabled: true,
    scheduledFingerprint: '',
  };

  await writeReminder(reminder, deps);

  return { status: 'ok', reminder };
}

/**
 * `deadline_missed` (`01§18`): timed → +15 мин после эффективного момента
 * дедлайна; date-only → 09:00 следующего дня. "if active" из текста ТЗ —
 * условие на момент СРАБАТЫВАНИЯ уведомления (будущая реконсиляция/
 * платформенный слой проверяет `task.status==='active'` перед фактической
 * доставкой), НЕ на момент создания правила — эта команда лишь вычисляет и
 * сохраняет правило, ей нечего знать про будущий статус задачи. Явно
 * фиксируем это здесь, чтобы будущий пакет работ (реконсиляция) не искал эту
 * проверку в этом файле по ошибке.
 */
export async function createDeadlineMissedReminderCommand(
  input: CreateDeadlineMissedReminderInput,
  deps: ReminderCommandDeps,
): Promise<CreateDeadlineMissedReminderResult> {
  if (input.deadlineDate === null) {
    return { status: 'invalid_input', reason: 'missing_deadline' };
  }
  const deadlineDate = input.deadlineDate;

  const firesAt =
    input.deadlineTime === null
      ? deadlineDate.add({ days: 1 }).toPlainDateTime(NINE_AM)
      : effectiveDeadlineDateTime(deadlineDate, input.deadlineTime).add({ minutes: 15 });

  const generateId = deps.generateId ?? generateUuidV7;
  const reminder: Reminder = {
    id: generateId(),
    taskId: input.taskId,
    kind: 'deadline_missed',
    localRuleJson: buildDeadlineLocalRuleJson(
      'deadline_missed',
      deadlineDate,
      input.deadlineTime,
      firesAt,
      null,
    ),
    enabled: true,
    scheduledFingerprint: '',
  };

  await writeReminder(reminder, deps);

  return { status: 'ok', reminder };
}
