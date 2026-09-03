import { generateUuidV7 } from '../identity/index.js';
import type { Reminder } from '../entities/reminder.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { NonEmptyArray } from './storage-port.js';
import type {
  CommandReminderDomainMutation,
  CommandReminderEntityWrite,
  ReminderCommandDeps,
} from './reminder-port.js';

/**
 * Единственная точка записи `Reminder` в хранилище для всех команд этого
 * модуля (CLAUDE.md, п.4: "Outbox пишется в одной транзакции с сущностью") —
 * общая для создания всех трёх видов и для отмены, ровно так же, как четыре
 * Task-команды делят один и тот же паттерн записи (`create-task.ts`/
 * `delete-task.ts` и соседи), просто без отдельного файла-хелпера (там это
 * инлайн в каждой команде — здесь вынесено в одно место, потому что записей
 * четыре, а не одна конструкция на файл).
 *
 * `Reminder` не несёт per-field HLC (`entities/reminder.ts` — в отличие от
 * `Task` нет `clocks`), поэтому, в отличие от `clock-diff.ts` (диффит поля
 * Task и тикает HLC только на изменившихся), здесь дифф не нужен: outbox
 * несёт снимок сущности целиком, `fieldClocksJson` всегда `{}`,
 * `baseRevision` всегда `0n` — та же конвенция, что уже использует
 * `packages/storage/src/contract/fixtures.ts` (`makeOutboxEntry`) для
 * reminder-фикстур в тестах контракта хранилища.
 */
export async function writeReminder(reminder: Reminder, deps: ReminderCommandDeps): Promise<void> {
  await writeReminders([reminder], deps);
}

/**
 * Обобщение `writeReminder` выше на НЕСКОЛЬКО сущностей ОДНОЙ атомарной
 * мутацией — нужно `replaceExplicitReminderCommand` (Task B8, ST10-
 * расследование, Задача 3, `reminder-replace.ts`): старая запись
 * (`enabled:false`) и новая (`enabled:true`) обязаны попасть в ОДИН
 * `applyMutation`/`runTransaction`, иначе сбой между двумя отдельными
 * коммитами оставляет пользователя вовсе без напоминания (владелец,
 * обоснование Задачи 3) — ровно тот же класс риска, ради которого
 * CLAUDE.md уже требует "outbox пишется в одной транзакции с сущностью".
 * `CommandReminderDomainMutation.writes`/`.outbox` уже массивы — это не
 * новый storage-примитив, а первое реальное использование уже
 * существовавшей возможности несколькими записями сразу
 * (`applyMutation` уже проверен на это контрактным тестом
 * `storage-contract.ts`, "применяет несколько сущностей одной
 * мутацией"/`listAllEnabled`'s фикстура). `writeReminder` выше — тонкая
 * обёртка над этой функцией с массивом из одного элемента, поведение
 * существующих вызывающих не меняется.
 */
export async function writeReminders(
  reminders: NonEmptyArray<Reminder>,
  deps: ReminderCommandDeps,
): Promise<void> {
  const generateOpId = deps.generateOpId ?? generateUuidV7;

  function outboxEntryFor(reminder: Reminder): SyncOutboxEntry {
    return {
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: 'reminder',
      entityId: reminder.id,
      patchJson: { ...reminder },
      fieldClocksJson: {},
      baseRevision: 0n,
      createdAt: deps.now,
      retryCount: 0,
    };
  }

  const [first, ...rest] = reminders;
  const mutation: CommandReminderDomainMutation = {
    writes: reminders.map((reminder): CommandReminderEntityWrite => ({
      entity: 'reminder',
      value: reminder,
    })),
    // Тюплом, не через `.map`/`push` на обычный массив — тип
    // `NonEmptyArray<SyncOutboxEntry>` (`readonly [T, ...T[]]`) реально
    // непуст по построению здесь, а не проверяется в рантайме и не
    // приводится приведением типа.
    outbox: [outboxEntryFor(first), ...rest.map(outboxEntryFor)],
  };

  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });
}
