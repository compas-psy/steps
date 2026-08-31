import type { AttachmentRepository } from './attachment-repository.js';
import type { ChecklistItemRepository } from './checklist-item-repository.js';
import type { ImportBatchRepository } from './import-batch-repository.js';
import type { LabelRepository } from './label-repository.js';
import type { ProjectRepository } from './project-repository.js';
import type { RecurrenceSeriesRepository } from './recurrence-series-repository.js';
import type { ReminderRepository } from './reminder-repository.js';
import type { SectionRepository } from './section-repository.js';
import type { SyncConflictRepository } from './sync-conflict-repository.js';
import type { SyncOutboxRepository } from './sync-outbox-repository.js';
import type { TaskLabelRepository } from './task-label-repository.js';
import type { TaskLinkRepository } from './task-link-repository.js';
import type { TaskRepository } from './task-repository.js';

/**
 * Все 13 таблиц конспекта §7 (кроме будущей R3 `vector_capture_batches`,
 * вне охвата волны) как read-only срез. И `StoragePort` (чтение снаружи
 * транзакции), и `StorageWriteTransaction` (чтение внутри, read-your-writes
 * своих же `applyMutation`, `./transaction.ts`) расширяют этот интерфейс —
 * один и тот же контракт запросов в обоих местах, чтобы командному слою не
 * приходилось помнить, какие методы доступны только "снаружи" транзакции.
 */
export interface StorageQueryPort {
  readonly tasks: TaskRepository;
  readonly projects: ProjectRepository;
  readonly sections: SectionRepository;
  readonly labels: LabelRepository;
  readonly taskLabels: TaskLabelRepository;
  readonly checklistItems: ChecklistItemRepository;
  readonly reminders: ReminderRepository;
  readonly recurrenceSeries: RecurrenceSeriesRepository;
  readonly attachments: AttachmentRepository;
  readonly taskLinks: TaskLinkRepository;
  readonly importBatches: ImportBatchRepository;
  readonly syncOutbox: SyncOutboxRepository;
  readonly syncConflicts: SyncConflictRepository;
}
