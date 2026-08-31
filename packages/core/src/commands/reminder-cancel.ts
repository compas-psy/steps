import type { Reminder } from '../entities/reminder.js';
import type { ReminderCommandDeps } from './reminder-port.js';
import { writeReminder } from './reminder-write.js';

/**
 * Вход `cancelReminderCommand` — принимает уже загруженную сущность целиком,
 * не `id`: у реального `ReminderRepository` (`packages/storage`) нет
 * `findById`, только `listByTask`/`countExplicitByTask` (см.
 * `reminder-port.ts`) — команда не может сама найти напоминание по `id`, ей
 * обязан передать его вызывающий код (тот же приём, что и остальные команды
 * этого пакета работ: вызывающий код уже держит нужную сущность).
 */
export interface CancelReminderInput {
  readonly reminder: Reminder;
}

/**
 * Итог отмены. `already_cancelled` — не ошибка и не "не найдено" (сущность
 * у нас есть целиком, в отличие от Task-команд, где `not_found` означает
 * ровно "такой записи не существует/уже tombstone") — здесь честнее
 * отдельное имя: повторная отмена уже отключённого напоминания — валидный,
 * идемпотентный ход, которому просто нечего писать.
 */
export type CancelReminderResult =
  { readonly status: 'ok'; readonly reminder: Reminder } | { readonly status: 'already_cancelled' };

/**
 * Отмена напоминания (`01§18`).
 *
 * Решение — `enabled:false`, не физическое удаление записи, хотя
 * `entities/reminder.ts` описывает удаление reminder как жёсткое (нет
 * `deleted_at`/tombstone в отличие от `Task`). Причина не в предпочтении, а
 * в том, что доступно этому пакету работ: реальный `ReminderRepository`
 * (`packages/storage/src/ports/reminder-repository.ts`, вне территории —
 * трогать нельзя) не предоставляет метод физического удаления, а
 * `DomainMutation`/`EntityWrite` (`packages/storage/src/ports/transaction.ts`,
 * тоже вне территории) — только upsert-канал: ни для одной сущности схемы,
 * включая `Task` (tombstone — это тоже upsert поля `deletedAt`), там нет
 * "удаляющей" операции. Физическое удаление reminder потребовало бы нового
 * примитива на стороне `@shagi/storage`, чего это задание прямо запрещает.
 *
 * Поэтому: `enabled:false`, записанный через тот же upsert-канал, что и
 * создание (`writeReminder`) — единственный canal мутации, реально доступный
 * отсюда. Задокументированный незакрытый шов (см. отчёт пакета работ): в
 * реальной sqlite/indexeddb-реализации `ReminderRepository.countExplicitByTask`
 * считает по `kind='explicit'` БЕЗ фильтра по `enabled` — отменённый (но не
 * стёртый) explicit reminder продолжит блокировать создание нового по
 * правилу 19, пока будущий пакет работ либо не научит счётчик игнорировать
 * `enabled=false`, либо не добавит в `@shagi/storage` настоящее физическое
 * удаление. Не решается здесь — оба файла вне территории этого пакета работ.
 */
export async function cancelReminderCommand(
  input: CancelReminderInput,
  deps: ReminderCommandDeps,
): Promise<CancelReminderResult> {
  if (!input.reminder.enabled) {
    return { status: 'already_cancelled' };
  }

  const cancelled: Reminder = { ...input.reminder, enabled: false };
  await writeReminder(cancelled, deps);

  return { status: 'ok', reminder: cancelled };
}
