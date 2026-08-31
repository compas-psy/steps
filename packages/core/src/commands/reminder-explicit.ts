import type { Temporal } from '@js-temporal/polyfill';

import type { Reminder } from '../entities/reminder.js';
import { generateUuidV7 } from '../identity/index.js';
import { validateExplicitReminder, type ReminderTaskDeadline } from '../validation/reminder.js';
import { buildResult, makeIssue, type ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import type { ReminderCommandDeps } from './reminder-port.js';
import { writeReminder } from './reminder-write.js';

/**
 * Вход `createExplicitReminderCommand` (`01§18` "At configured local
 * date/time"). `date`/`time` — уже разобранные значения (не сырой
 * `localRuleJson` — тот непрозрачен по дизайну, `entities/reminder.ts`: "эту
 * форму определит команда"). `deadlineDate`/`deadlineTime` — снимок дедлайна
 * задачи на момент вызова, не читается из хранилища заново (то же
 * соображение, что у остальных команд этого пакета работ: вызывающий код
 * уже держит актуальную задачу) — нужен только правилу 34.
 */
export interface CreateExplicitReminderInput {
  readonly taskId: Uuid;
  readonly date: Temporal.PlainDate;
  readonly time: Temporal.PlainTime | null;
  readonly deadlineDate: Temporal.PlainDate | null;
  readonly deadlineTime: Temporal.PlainTime | null;
}

/**
 * Итог `createExplicitReminderCommand`. Два исхода:
 *
 * - `rejected` — правило 19 (блокирующее: уже есть explicit reminder на эту
 *   задачу). Форма `validation` та же, что у `ValidationResult` остального
 *   валидатора (`makeIssue(19, 'TASK_REMINDER_LIMIT_EXCEEDED', ...)`) — тот
 *   же код и номер правила, что уже использует `validation/task.ts`
 *   (`checkReminderLimit`), для согласованности кода ошибки в UI, хотя сама
 *   проверка здесь не идёт через `validateDomainMutation` (там нет входа для
 *   reminder-специфичной команды) — задание явно указывает вызывать готовый
 *   `ReminderRepository.countExplicitByTask` напрямую.
 * - `ok` — запись создана и сохранена. `validation` несёт результат правила
 *   34 (`validateExplicitReminder`) — предупреждение "напоминание после
 *   дедлайна" НЕ блокирует сохранение (`01§5`, "save allowed"), но должно
 *   дойти до вызывающего кода, поэтому оно в ответе команды, а не отброшено
 *   молча.
 */
export type CreateExplicitReminderResult =
  | { readonly status: 'ok'; readonly reminder: Reminder; readonly validation: ValidationResult }
  | { readonly status: 'rejected'; readonly validation: ValidationResult };

/**
 * `localRuleJson` explicit-напоминания: `{ date, time, firesAt }`, где
 * `date`/`time` — `Temporal.PlainDate|PlainTime.toString()` пользовательского
 * ввода (та же конвенция сериализации `Temporal`, что уже использует
 * golden-корпус `packages/nlp`), а `firesAt` — разрешённый момент срабатывания
 * (`PlainDateTime.toString()`), единое поле, одинаковое по имени и смыслу во
 * всех трёх видах напоминаний (`reminder-deadline.ts`) — так будущая
 * реконсиляция читает один и тот же ключ независимо от `kind`, не разбирая
 * каждый вид по-своему. Отсутствие времени (`time=null`) трактуется как
 * полночь (00:00) при вычислении `firesAt` — та же конвенция, что уже
 * применяет `isReminderAfterDeadline` (`temporal/predicates.ts`) при
 * сравнении с дедлайном.
 */
function buildExplicitLocalRuleJson(
  date: Temporal.PlainDate,
  time: Temporal.PlainTime | null,
): Readonly<Record<string, unknown>> {
  const firesAt = time === null ? date.toPlainDateTime() : date.toPlainDateTime(time);
  return {
    kind: 'explicit',
    date: date.toString(),
    time: time === null ? null : time.toString(),
    firesAt: firesAt.toString(),
  };
}

export async function createExplicitReminderCommand(
  input: CreateExplicitReminderInput,
  deps: ReminderCommandDeps,
): Promise<CreateExplicitReminderResult> {
  const existingExplicitCount = await deps.storage.reminders.countExplicitByTask(input.taskId);
  if (existingExplicitCount >= 1) {
    return {
      status: 'rejected',
      validation: buildResult([
        makeIssue(19, 'TASK_REMINDER_LIMIT_EXCEEDED', 'blocking', 'reminders', {
          limit: 1,
          current: existingExplicitCount,
        }),
      ]),
    };
  }

  const deadline: ReminderTaskDeadline = {
    deadlineDate: input.deadlineDate,
    deadlineTime: input.deadlineTime,
  };
  const validation = validateExplicitReminder({ date: input.date, time: input.time }, deadline);

  const generateId = deps.generateId ?? generateUuidV7;
  const reminder: Reminder = {
    id: generateId(),
    taskId: input.taskId,
    kind: 'explicit',
    localRuleJson: buildExplicitLocalRuleJson(input.date, input.time),
    enabled: true,
    scheduledFingerprint: '',
  };

  await writeReminder(reminder, deps);

  return { status: 'ok', reminder, validation };
}
