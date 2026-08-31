import type { Task } from '../entities/task.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { TaskValidationContext } from '../validation/task.js';
import type { Uuid } from '../values.js';

/**
 * Порт хранения командного слоя (задание E01.4) — **инверсия зависимости**,
 * разобранная целиком в ADR-0003. Коротко: `packages/storage` уже зависит
 * от `@shagi/core` (импортирует `Task`, `Project`, ...), поэтому `core` не
 * может импортировать `StoragePort` из `storage` — это был бы цикл
 * `storage → core → storage`, который не соберётся. `core/commands`
 * объявляет собственный, минимальный интерфейс, пользуясь исключительно
 * типами, которые уже есть в этом пакете.
 *
 * Форма ниже — **структурно** то же самое, что `StoragePort`/
 * `StorageWriteTransaction`/`DomainMutation`/`EntityWrite` в
 * `packages/storage/src/ports/{storage-port,transaction}.ts` (те же поля,
 * та же семантика), но объявлена заново, без импорта. Благодаря структурной
 * типизации TypeScript настоящий `StoragePort` подходит сюда без единого
 * адаптера — присваивание проверяется по форме, не по имени объявления. Это
 * работает только потому, что все методы ниже объявлены method-синтаксисом
 * (`foo(...): ...`, не `foo: (...) => ...`) — TypeScript сравнивает
 * параметры таких методов бивариантно, а не строго контравариантно
 * (`strictFunctionTypes` эту бивариантность как раз не трогает для
 * method-синтаксиса), так что `runTransaction`/`applyMutation` реального
 * порта (принимающие более широкий `StorageWriteTransaction`/`DomainMutation`
 * с полным набором сущностей) проходят проверку присваиваемости этому более
 * узкому интерфейсу (только `task` и то, что реально нужно командам).
 * Подробный разбор направления присваиваемости — в ADR-0003.
 */

/** Локальный эквивалент `NonEmptyArray` из `packages/storage/src/values.ts`
 * (дублировать импорт нельзя — тот пакет зависит от этого). Тот же смысл:
 * `applyMutation` без единой outbox-записи не компилируется. */
export type NonEmptyArray<T> = readonly [T, ...T[]];

/**
 * Срез `TaskRepository` (`packages/storage/src/ports/task-repository.ts`),
 * нужный именно командам — не весь `StorageQueryPort`. `findById` — чтобы
 * `update`/`complete`/`delete` могли загрузить текущее состояние; читает и
 * tombstone (то же соглашение, что у реального `TaskRepository.findById`:
 * "сырое чтение, tombstone включительно" — решение, мутировать ли
 * tombstone-запись, принимает вызывающая команда). `loadValidationContext`
 * — готовый `TaskValidationContext` (родитель + пять счётчиков лимитов)
 * одним вызовом, ровно то, что нужно перед `validateDomainMutation`.
 */
export interface CommandTaskReader {
  findById(id: Uuid): Promise<Task | null>;
  loadValidationContext(id: Uuid | null, parentTaskId: Uuid | null): Promise<TaskValidationContext>;
}

/** Единственная форма записи, которую умеют команды этого пакета работ —
 * подмножество `EntityWrite` из `packages/storage`: там дискриминированное
 * объединение на 10 типов сущностей, здесь — только `task` (Project/Section/
 * Label/Recurrence вне охвата E01.4, см. задание, раздел «Границы»). Это
 * ПОДмножество union'а `EntityWrite`, что и делает `CommandDomainMutation`
 * присваиваемым в `DomainMutation` (не наоборот) — см. ADR-0003. */
export interface CommandEntityWrite {
  readonly entity: 'task';
  readonly value: Task;
}

/** Структурный эквивалент `DomainMutation` (`packages/storage/src/ports/transaction.ts`)
 * — те же два поля, та же семантика (`writes` может быть пустым, `outbox`
 * не может — то же обоснование, что там: recurrence-atomic-completion в
 * будущем может писать мутацию без канонических изменений, но не без
 * outbox-записи). */
export interface CommandDomainMutation {
  readonly writes: readonly CommandEntityWrite[];
  readonly outbox: NonEmptyArray<SyncOutboxEntry>;
}

/** Структурный эквивалент `StorageWriteTransaction` — единственный метод
 * мутации внутри транзакции, плюс чтение (read-your-writes здесь командам
 * не нужен: ни одна из четырёх команд этого пакета не делает больше одного
 * `applyMutation` за вызов, поэтому не требует перечитывать свою же запись
 * из середины транзакции — в отличие от будущего recurrence atomic
 * completion, эпик E11). */
export interface CommandStorageWriteTransaction {
  readonly tasks: CommandTaskReader;
  applyMutation(mutation: CommandDomainMutation): Promise<void>;
}

/**
 * Точка входа, которую командный слой требует от хранилища. Структурный
 * эквивалент `StoragePort` (`packages/storage/src/ports/storage-port.ts`) —
 * `purgeExpiredTombstones` сюда не входит: это системная поддержка, не
 * пользовательская команда (см. комментарий реального порта), командам
 * этого пакета работ она не нужна.
 */
export interface CommandStoragePort {
  readonly tasks: CommandTaskReader;
  runTransaction<T>(run: (tx: CommandStorageWriteTransaction) => Promise<T>): Promise<T>;
}
