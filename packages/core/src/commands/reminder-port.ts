import type { Temporal } from '@js-temporal/polyfill';

import type { Reminder } from '../entities/reminder.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { Uuid } from '../values.js';
import type { NonEmptyArray } from './storage-port.js';

/**
 * Порт хранения командного слоя Reminder — тот же архитектурный приём, что
 * `commands/storage-port.ts` для Task (инверсия зависимости, ADR-0003):
 * `@shagi/core` не может импортировать `ReminderRepository`/`StoragePort` из
 * `@shagi/storage` (это создало бы цикл `storage → core → storage`,
 * `packages/storage` уже импортирует `Reminder` из `@shagi/core`), поэтому
 * здесь объявлен собственный, минимальный, структурно совместимый
 * интерфейс — реальный `StoragePort` подходит сюда без единого адаптера
 * (структурная типизация TypeScript, разбор направления — в ADR-0003 и в
 * комментарии `commands/storage-port.ts`).
 *
 * Этот файл **не переиспользует** `CommandStoragePort`/`CommandDomainMutation`
 * из `commands/storage-port.ts` и не расширяет их: тот union `CommandEntityWrite`
 * замкнут буквально на `entity:'task'` (пакет работ E01.4), а сам файл вне
 * территории этого пакета работ (CLAUDE.md/задание: "НЕ трогай... storage-port.ts").
 * Поэтому здесь заведён параллельный, такой же по форме, но независимый
 * набор типов, сужённый на `entity:'reminder'`.
 *
 * `CommandReminderReader` — структурный срез
 * `packages/storage/src/ports/reminder-repository.ts` (`ReminderRepository`),
 * не импортируется по той же причине цикла. Важно: у настоящего
 * `ReminderRepository` нет ни `findById`, ни физического удаления — только
 * `listByTask`/`countExplicitByTask`. Это ограничивает то, что могут делать
 * команды этого файла (см. `reminder-cancel.ts` про решение по отмене).
 */
export interface CommandReminderReader {
  /** Правило 19 (`02§2` "max 1 explicit reminder на задачу") — прямой вход
   * для проверки лимита перед созданием explicit reminder. */
  countExplicitByTask(taskId: Uuid): Promise<number>;
}

/** Единственная форма записи, которую умеют команды этого файла — узкое
 * (только `entity:'reminder'`) подмножество `EntityWrite` из
 * `packages/storage/src/ports/transaction.ts`. Подмножество и делает
 * `CommandReminderDomainMutation` присваиваемым в `DomainMutation`, а не
 * наоборот — то же рассуждение, что в `commands/storage-port.ts`. */
export interface CommandReminderEntityWrite {
  readonly entity: 'reminder';
  readonly value: Reminder;
}

/** Структурный эквивалент `DomainMutation`, суженный на reminder-записи. */
export interface CommandReminderDomainMutation {
  readonly writes: readonly CommandReminderEntityWrite[];
  readonly outbox: NonEmptyArray<SyncOutboxEntry>;
}

/**
 * Структурный эквивалент `StorageWriteTransaction` — единственный нужный
 * командам этого файла метод, `applyMutation`. Объявлен method-синтаксисом
 * (не свойством-функцией) намеренно: только так TypeScript сравнивает его
 * параметр бивариантно и принимает реальный `applyMutation(mutation: DomainMutation)`
 * (более широкий тип параметра) как совместимый с этим более узким
 * объявлением — см. подробный разбор в `commands/storage-port.ts`.
 */
export interface CommandReminderWriteTransaction {
  applyMutation(mutation: CommandReminderDomainMutation): Promise<void>;
}

/** Точка входа, которую этот файл команд требует от хранилища. Структурный
 * эквивалент `StoragePort` (через `StorageQueryPort.reminders`), суженный
 * до `reminders`+`runTransaction`. */
export interface CommandReminderStoragePort {
  readonly reminders: CommandReminderReader;
  runTransaction<T>(run: (tx: CommandReminderWriteTransaction) => Promise<T>): Promise<T>;
}

/**
 * Зависимости команд этого файла. Два независимых "сейчас" — не дублирование,
 * а честное разделение двух систем координат домена (CLAUDE.md, «Время»):
 *
 * - `now: Temporal.Instant` — глобальная физическая метка, тот же смысл, что
 *   `TaskCommandDeps.now` (`commands/types.ts`): источник для `sync_outbox.createdAt`.
 *   `Reminder` не несёт `clocks` (`entities/reminder.ts`), поэтому HLC здесь
 *   не тикается — `now` нужен только outbox-записи.
 * - `nowLocal: Temporal.PlainDateTime` — плавающее локальное "сейчас", та же
 *   система координат, что `deadlineDate`/`deadlineTime`/explicit
 *   `date`/`time` (`01§5`, `temporal/predicates.ts`). Только в этой системе
 *   координат имеют смысл пороги §18 ("24ч/2ч/1ч до дедлайна по настенным
 *   часам локального устройства") — сравнивать их с `Instant` означало бы
 *   протащить часовой пояс внутрь домена, где спека его не называет.
 *
 * Вызывающий код обязан передать оба значения, согласованные между собой
 * (одна и та же реальная точка "сейчас", просто в двух представлениях) —
 * эта команда не конвертирует одно в другое сама, чтобы не решать за
 * вызывающий код, какая таймзона действует (это уже принадлежит `01§19`,
 * будущему пакету работ, явно исключённому из этого).
 */
export interface ReminderCommandDeps {
  readonly storage: CommandReminderStoragePort;
  readonly now: Temporal.Instant;
  readonly nowLocal: Temporal.PlainDateTime;
  readonly deviceId: Uuid;
  readonly generateId?: () => Uuid;
  readonly generateOpId?: () => Uuid;
}
