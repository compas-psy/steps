import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { TaskLabel } from '../entities/task-label.js';
import type { Uuid } from '../values.js';
import type { NonEmptyArray } from './storage-port.js';

/**
 * Порт хранения командного слоя TaskLabel (пакет работ E10, `02§8` OR-set).
 * Тот же архитектурный приём инверсии зависимости, что `label-port.ts`.
 *
 * `CommandTaskLabelReader` — структурный срез `TaskLabelRepository`
 * (`packages/storage/src/ports/task-label-repository.ts`): `listByTask`
 * (upsert-поиск существующей связи при attach/detach — включая мёртвые по
 * HLC, фильтрация активности на вызывающей стороне через `isTaskLabelActive`,
 * тот же приём, что документирует комментарий реального порта) и
 * `listByLabel` (`deleteLabelCommand` — все связи снимаемой метки).
 * `countActiveByTask` реального порта сюда НЕ входит — лимит 18 команды
 * этого файла проверяют через `CommandTaskReader.loadValidationContext`
 * (Task-порт, `storage-port.ts`), который уже готово несёт `labelCount`, а
 * не пересчитывают его заново из `TaskLabelRepository` напрямую.
 */
export interface CommandTaskLabelReader {
  listByTask(taskId: Uuid): Promise<readonly TaskLabel[]>;
  listByLabel(labelId: Uuid): Promise<readonly TaskLabel[]>;
}

/** `task_labels` не несёт `id` (составной ключ `(taskId, labelId)`,
 * `entities/task-label.ts`) — запись сюда всегда upsert по этому ключу
 * (комментарий реального порта). */
export interface CommandTaskLabelEntityWrite {
  readonly entity: 'task_label';
  readonly value: TaskLabel;
}

export interface CommandTaskLabelDomainMutation {
  readonly writes: readonly CommandTaskLabelEntityWrite[];
  readonly outbox: NonEmptyArray<SyncOutboxEntry>;
}

export interface CommandTaskLabelWriteTransaction {
  applyMutation(mutation: CommandTaskLabelDomainMutation): Promise<void>;
}

export interface CommandTaskLabelStoragePort {
  readonly taskLabels: CommandTaskLabelReader;
  runTransaction<T>(run: (tx: CommandTaskLabelWriteTransaction) => Promise<T>): Promise<T>;
}
