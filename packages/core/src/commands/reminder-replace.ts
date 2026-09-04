import type { Temporal } from '@js-temporal/polyfill';

import type { Reminder } from '../entities/reminder.js';
import { generateUuidV7 } from '../identity/index.js';
import { validateExplicitReminder, type ReminderTaskDeadline } from '../validation/reminder.js';
import { buildResult, makeIssue, type ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import { buildExplicitLocalRuleJson } from './reminder-explicit.js';
import { computeReminderFingerprint } from './reminder-fingerprint.js';
import type { ReminderCommandDeps } from './reminder-port.js';
import { writeReminders } from './reminder-write.js';

/**
 * Вход `replaceExplicitReminderCommand` (Task B8, ST10-расследование,
 * Задача 3 — владелец). Заменяет один active explicit reminder другим
 * ОДНОЙ атомарной мутацией — старое поведение
 * `TaskDetail.handleSubmitReminder` (раздельные `cancelReminderCommand`
 * + `createExplicitReminderCommand`, каждая своя транзакция) оставляло
 * реальный gap: сбой между двумя коммитами оставлял пользователя вовсе
 * без напоминания — старое уже отменено, новое не создано (найдено живым
 * прогоном Task B8, Step 2c: `countExplicitByTask` без фильтра по
 * `enabled` — уже исправлено отдельно, коммит `8df2dc7` — но сама
 * двухшаговость оставалась источником риска и после этого фикса).
 *
 * `old` — ТА САМАЯ запись, что вызывающий код (`TaskDetail.tsx`) уже
 * держит как `explicitReminder` (тот же прекон, что уже документирует
 * `CancelReminderInput`, `reminder-cancel.ts`: у реального
 * `ReminderRepository` нет `findById`, команда не может сама найти
 * запись по `id`).
 */
export interface ReplaceExplicitReminderInput {
  readonly old: Reminder;
  readonly taskId: Uuid;
  readonly date: Temporal.PlainDate;
  readonly time: Temporal.PlainTime | null;
  readonly deadlineDate: Temporal.PlainDate | null;
  readonly deadlineTime: Temporal.PlainTime | null;
}

/**
 * Итог замены. Форма — зеркало `CreateExplicitReminderResult`
 * (`reminder-explicit.ts`): та же пара исходов (`rejected` — правило 19,
 * `ok` — с результатом валидации правила 34), тот же смысл каждого поля.
 * Замена САМОЙ СЕБЯ не в счёт «уже есть explicit reminder» (см. функцию
 * ниже) — блокирует только ДРУГОЙ, независимый active explicit reminder.
 *
 * `stale` (владелец, hardening после Задачи 3) — `input.old.id` не
 * указывает на текущий active explicit reminder этой задачи (гонка:
 * пока экран держал устаревший `explicitReminder`, реальная запись уже
 * успела исчезнуть/смениться — тот же класс риска, ради которого вообще
 * затевалось это расследование). НЕ business-правило (не `ValidationResult`
 * — это не про то, что человек ввёл, а про то, что вызывающий код держит
 * устаревшую ссылку) и не исключение (вызывающий код — обычный async
 * React-обработчик, непойманный throw был бы ровно тем unhandled-rejection
 * риском, что уже нашла Задача 4/ST10-расследование) — отдельный именованный
 * статус, тот же приём, что уже `cancelReminderCommand`'s `already_cancelled`.
 */
export type ReplaceExplicitReminderResult =
  | { readonly status: 'ok'; readonly reminder: Reminder; readonly validation: ValidationResult }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'stale' };

export async function replaceExplicitReminderCommand(
  input: ReplaceExplicitReminderInput,
  deps: ReminderCommandDeps,
): Promise<ReplaceExplicitReminderResult> {
  const existing = await deps.storage.reminders.listByTask(input.taskId);

  // Canonical wins (владелец): из `input.old` читается ТОЛЬКО `.id` —
  // остальные поля вызывающего кода (`TaskDetail.tsx`'s React-состояние)
  // могут быть устаревшими, реальная запись, с которой сравниваются
  // `kind`/`enabled`, берётся из `existing` (только что прочитанного
  // `listByTask`), а не слепо из переданного объекта. `listByTask(input.
  // taskId)` уже гарантирует `taskId === input.taskId` для каждого
  // найденного элемента (её собственный контракт) — отдельная проверка
  // здесь была бы недостижимым кодом.
  const canonicalOld = existing.find((reminder) => reminder.id === input.old.id);
  if (canonicalOld === undefined || canonicalOld.kind !== 'explicit' || !canonicalOld.enabled) {
    return { status: 'stale' };
  }

  // Правило 19 (`02§2`): замена `canonicalOld` собой не считается «ещё
  // одним» reminder'ом — блокирует только ЧУЖОЙ active explicit reminder
  // на той же задаче (реальный сценарий: конкурентная запись между тем,
  // как экран прочитал `old`, и этим вызовом — например, другое
  // устройство через sync). `countExplicitByTask` (даже после фикса
  // `enabled`-фильтра, коммит `8df2dc7`) не различает «единственная
  // enabled-запись — это `canonicalOld`» от «единственная enabled-запись —
  // ДРУГАЯ» без хрупкого `-1`; `listByTask` + явное исключение
  // `canonicalOld.id` даёт точный ответ.
  const otherActiveExplicit = existing.filter(
    (reminder) =>
      reminder.id !== canonicalOld.id && reminder.kind === 'explicit' && reminder.enabled,
  );
  if (otherActiveExplicit.length >= 1) {
    return {
      status: 'rejected',
      validation: buildResult([
        makeIssue(19, 'TASK_REMINDER_LIMIT_EXCEEDED', 'blocking', 'reminders', {
          limit: 1,
          current: otherActiveExplicit.length + 1,
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
  const localRuleJson = buildExplicitLocalRuleJson(input.date, input.time);
  // Заголовок задачи для отпечатка (Task A6) — тот же приём, что
  // `createExplicitReminderCommand`: читается живьём на момент замены, не
  // передаётся вызывающим кодом.
  const task = await deps.storage.tasks.findById(input.taskId);
  const title = task?.title ?? '';
  const newReminder: Reminder = {
    id: generateId(),
    taskId: input.taskId,
    kind: 'explicit',
    localRuleJson,
    enabled: true,
    scheduledFingerprint: computeReminderFingerprint(
      { kind: 'explicit', localRuleJson, enabled: true },
      title,
    ),
  };
  const disabledOld: Reminder = { ...canonicalOld, enabled: false };

  // ОДНА атомарная мутация — `disabledOld`+`newReminder` попадают в один
  // `applyMutation`/`runTransaction` (`writeReminders`, `reminder-write.ts`):
  // либо обе записи применены, либо ни одна. Порядок элементов
  // (`disabledOld` первым) не имеет значения для атомарности — оба
  // входят в один и тот же `mutation.writes`.
  await writeReminders([disabledOld, newReminder], deps);

  return { status: 'ok', reminder: newReminder, validation };
}
