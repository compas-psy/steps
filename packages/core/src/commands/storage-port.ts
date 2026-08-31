import type { ChecklistItem } from '../entities/checklist-item.js';
import type { RecurrenceSeries } from '../entities/recurrence-series.js';
import type { Task, TaskStatus } from '../entities/task.js';
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
 *
 * `listDirectSubtasks` — добавлен пакетом работ E10 для каскада
 * `deleteTaskCommand` (`01§9` "Parent delete cascades direct subtasks/
 * checklist/links"): сигнатура скопирована буквально с реального
 * `TaskRepository.listDirectSubtasks` (`packages/storage`), метод уже
 * существует там (индекс `tasks(parent_task_id, status, rank)`) — здесь
 * лишь объявлен структурный срез, ничего нового в хранилище не требуется.
 *
 * `listBySeries` — добавлен пакетом работ E12.4 для `restoreTaskCommand`
 * (`01§11.10` "Restore old recurrence": "no next active occurrence exists"
 * — команде нужно САМОЙ это проверить, не доверяясь вызывающему коду).
 * Тем же приёмом, что `listDirectSubtasks` выше — сигнатура скопирована
 * буквально с реального `TaskRepository.listBySeries` (`packages/storage`,
 * индекс `tasks(series_id, status)`, метод уже существует и уже покрыт
 * контрактными тестами хранилища), ничего нового в хранилище не требуется.
 */
export interface CommandTaskReader {
  findById(id: Uuid): Promise<Task | null>;
  loadValidationContext(id: Uuid | null, parentTaskId: Uuid | null): Promise<TaskValidationContext>;
  listDirectSubtasks(parentTaskId: Uuid, status: TaskStatus): Promise<readonly Task[]>;
  listBySeries(seriesId: Uuid, status: TaskStatus): Promise<readonly Task[]>;
}

/**
 * Срез `ChecklistItemRepository` (`packages/storage/src/ports/
 * checklist-item-repository.ts`) — добавлен пакетом работ E10. Живёт в этом
 * же файле (не в отдельном `checklist-item-port.ts`), потому что
 * `createChecklistItemCommand` обязан повторно провалидировать РОДИТЕЛЬСКУЮ
 * Task на лимит 17 (правило 17, `validation/task.ts`) — а значит ему в любом
 * случае нужен именно ЭТОТ `CommandTaskReader.loadValidationContext`, тот
 * же порт, что уже используют `create/update/complete/deleteTaskCommand`.
 * Заводить для checklist item отдельный, полностью независимый порт (как
 * `reminder-port.ts`) означало бы дать `ChecklistItemCommandDeps` ДВА поля
 * (`storage` под checklist item + `taskStorage` под Task) вместо одного —
 * лишний уровень непрямоты там, где реальный `StoragePort`
 * (`packages/storage`) и так уже одна общая точка входа на обе таблицы. У
 * реального `ChecklistItemRepository` нет `findById` (только `listByTask`/
 * `countActiveByTask`, см. комментарий файла) — поэтому у
 * `updateChecklistItemCommand`/`deleteChecklistItemCommand` в качестве входа
 * требуется `taskId` явно (см. эти файлы): без него неоткуда взять список,
 * в котором искать нужный `id`.
 */
export interface CommandChecklistItemReader {
  listByTask(taskId: Uuid): Promise<readonly ChecklistItem[]>;
  countActiveByTask(taskId: Uuid): Promise<number>;
}

/**
 * Срез `RecurrenceSeriesRepository` (`packages/storage/src/ports/
 * recurrence-series-repository.ts`) — добавлен пакетом работ E11. Живёт в
 * этом же файле (не в отдельном `recurrence-series-port.ts`), тем же
 * рассуждением, что и `CommandChecklistItemReader` выше: команды повторов
 * (`create-recurring-task.ts`/`complete-occurrence.ts`/`undo-complete-
 * occurrence.ts`/`update-series-template.ts`/`delete-series.ts`) в ЛЮБОМ
 * вызове читают/пишут Task (сам occurrence) и RecurrenceSeries ВМЕСТЕ —
 * заводить для серии полностью отдельный порт (как `label-port.ts`) означало
 * бы дать их deps ДВА поля хранения вместо одного, лишняя непрямота там, где
 * реальный `StoragePort` и так одна точка входа на обе таблицы (тот же
 * аргумент, что уже принят для `checklistItems`).
 */
export interface CommandRecurrenceSeriesReader {
  findById(id: Uuid): Promise<RecurrenceSeries | null>;
}

/** Единственные формы записи, которые умеют команды этого файла —
 * подмножество `EntityWrite` из `packages/storage`: там дискриминированное
 * объединение на 10 типов сущностей, здесь — `task` (E01.4), `checklist_item`
 * (E10) и, с пакета работ E11, `recurrence_series` (см. комментарий
 * `CommandRecurrenceSeriesReader` выше про причину общего порта).
 * Project/Section/Label — вне охвата, у них свои узкие порты
 * (`project-port.ts`/`section-port.ts`/`label-port.ts`/`task-label-port.ts`).
 * Это ПОДмножество union'а `EntityWrite`, что и делает `CommandDomainMutation`
 * присваиваемым в `DomainMutation` (не наоборот) — см. ADR-0003; сам ADR
 * прямо предусматривает этот путь расширения ("расширит `CommandEntityWrite`
 * до объединения... совместимо с этим ADR"). */
export type CommandEntityWrite =
  | { readonly entity: 'task'; readonly value: Task }
  | { readonly entity: 'checklist_item'; readonly value: ChecklistItem }
  | { readonly entity: 'recurrence_series'; readonly value: RecurrenceSeries };

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
  readonly checklistItems: CommandChecklistItemReader;
  readonly recurrenceSeries: CommandRecurrenceSeriesReader;
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
  readonly checklistItems: CommandChecklistItemReader;
  readonly recurrenceSeries: CommandRecurrenceSeriesReader;
  runTransaction<T>(run: (tx: CommandStorageWriteTransaction) => Promise<T>): Promise<T>;
}
