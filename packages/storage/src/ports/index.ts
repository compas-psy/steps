/**
 * `@shagi/storage/ports` — контракт репозиториев и транзакции (задание
 * пакета работ E02.1, п.2). React и оболочки видят только эти типы, никогда
 * SQLite/IndexedDB напрямую (`00§2`).
 */
export type { AttachmentRepository } from './attachment-repository.js';
export type { ChecklistItemRepository } from './checklist-item-repository.js';
export type { ImportBatchRepository } from './import-batch-repository.js';
export type { LabelRepository } from './label-repository.js';
export type { ProjectRepository } from './project-repository.js';
export type { StorageQueryPort } from './query-port.js';
export type { RecurrenceSeriesRepository } from './recurrence-series-repository.js';
export type { ReminderRepository } from './reminder-repository.js';
export type { SectionRepository } from './section-repository.js';
export type {
  StoragePort,
  StorageWriteTransaction,
  TombstonePurgeSummary,
} from './storage-port.js';
export type { SyncConflictRepository } from './sync-conflict-repository.js';
export type { SyncOutboxRepository } from './sync-outbox-repository.js';
export type { TaskLabelRepository } from './task-label-repository.js';
export type { TaskLinkRepository } from './task-link-repository.js';
export type { TaskRepository } from './task-repository.js';
export type {
  AssertEntityTypeCoversEntityWrite,
  AssertEntityWriteCoversEntityType,
  DomainMutation,
  EntityWrite,
} from './transaction.js';
