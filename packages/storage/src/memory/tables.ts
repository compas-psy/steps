import type {
  Attachment,
  ChecklistItem,
  ImportBatch,
  Label,
  Project,
  RecurrenceSeries,
  Reminder,
  Section,
  SyncConflict,
  SyncOutboxEntry,
  Task,
  TaskLabel,
  TaskLink,
  Uuid,
} from '@shagi/core';

/**
 * Тринадцать таблиц как `Map`, хранящие ЦЕЛИКОМ доменные типы `@shagi/core`
 * (не разложенные по колонкам `../schema/tables.ts` — то разложение
 * описывает физическую SQL/IndexedDB схему для БУДУЩИХ адаптеров, эталонная
 * реализация в памяти не обязана её физически воспроизводить: её роль —
 * поведенческий эталон контракта репозиториев, п.6 задания E02.1, а не
 * третий бэкенд со своим SQL). Значения — `readonly` доменные объекты,
 * никогда не мутируются на месте; каждая запись заменяется целиком новой
 * ссылкой через `applyMutation`, поэтому клон таблицы для транзакции —
 * дешёвый `new Map(source)` (копирует пары ключ/значение, не сами объекты).
 */
export interface InMemoryTables {
  tasks: Map<Uuid, Task>;
  projects: Map<Uuid, Project>;
  sections: Map<Uuid, Section>;
  labels: Map<Uuid, Label>;
  /** Ключ — `"${taskId}:${labelId}"` (составной первичный ключ, см.
   * `../schema/tables.ts` `TASK_LABELS_TABLE`). */
  taskLabels: Map<string, TaskLabel>;
  checklistItems: Map<Uuid, ChecklistItem>;
  reminders: Map<Uuid, Reminder>;
  recurrenceSeries: Map<Uuid, RecurrenceSeries>;
  attachments: Map<Uuid, Attachment>;
  taskLinks: Map<Uuid, TaskLink>;
  importBatches: Map<Uuid, ImportBatch>;
  /** Ключ — `opId`. */
  syncOutbox: Map<Uuid, SyncOutboxEntry>;
  syncConflicts: Map<Uuid, SyncConflict>;
}

export function taskLabelKey(taskId: Uuid, labelId: Uuid): string {
  return `${taskId}:${labelId}`;
}

export function createEmptyTables(): InMemoryTables {
  return {
    tasks: new Map(),
    projects: new Map(),
    sections: new Map(),
    labels: new Map(),
    taskLabels: new Map(),
    checklistItems: new Map(),
    reminders: new Map(),
    recurrenceSeries: new Map(),
    attachments: new Map(),
    taskLinks: new Map(),
    importBatches: new Map(),
    syncOutbox: new Map(),
    syncConflicts: new Map(),
  };
}

/** Неглубокий клон всех таблиц — основа изоляции транзакции
 * (`../memory/in-memory-storage.ts` `runTransaction`): дешёвый и корректный
 * ровно потому, что значения таблиц никогда не мутируются на месте (см.
 * заголовочный комментарий). */
export function cloneTables(source: InMemoryTables): InMemoryTables {
  return {
    tasks: new Map(source.tasks),
    projects: new Map(source.projects),
    sections: new Map(source.sections),
    labels: new Map(source.labels),
    taskLabels: new Map(source.taskLabels),
    checklistItems: new Map(source.checklistItems),
    reminders: new Map(source.reminders),
    recurrenceSeries: new Map(source.recurrenceSeries),
    attachments: new Map(source.attachments),
    taskLinks: new Map(source.taskLinks),
    importBatches: new Map(source.importBatches),
    syncOutbox: new Map(source.syncOutbox),
    syncConflicts: new Map(source.syncConflicts),
  };
}
