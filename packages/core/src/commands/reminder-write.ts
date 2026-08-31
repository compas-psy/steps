import { generateUuidV7 } from '../identity/index.js';
import type { Reminder } from '../entities/reminder.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
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
  const generateOpId = deps.generateOpId ?? generateUuidV7;

  const outboxEntry: SyncOutboxEntry = {
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

  const write: CommandReminderEntityWrite = { entity: 'reminder', value: reminder };
  const mutation: CommandReminderDomainMutation = { writes: [write], outbox: [outboxEntry] };

  await deps.storage.runTransaction(async (tx) => {
    await tx.applyMutation(mutation);
  });
}
