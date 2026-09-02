import type { Temporal } from '@js-temporal/polyfill';

import type { ImportBatch } from '@shagi/core';

import type {
  DomainMutation,
  StoragePort,
  StorageWriteTransaction,
  TombstonePurgeSummary,
  WorkspaceExport,
} from '../ports/index.js';
import { isTombstoneExpired } from '../tombstone/index.js';
import { isNonEmptyArray } from '../values.js';

import { createQueryPort } from './repositories.js';
import { cloneTables, createEmptyTables, taskLabelKey, type InMemoryTables } from './tables.js';

/**
 * Эталонная реализация `StoragePort` в памяти (задание пакета работ E02.1,
 * п.6). Две роли: (а) даёт доменному/командному слою реальное хранилище
 * для тестов без базы; (б) эталон поведения — тот же общий набор тестов
 * контракта (`../contract/storage-contract.ts`) прогоняется против неё
 * сейчас и против SQLite/IndexedDB адаптеров в следующих пакетах работ, что
 * и гарантирует, что семантика не разъедется между платформами (`02§4`).
 *
 * `runTransaction` — copy-on-write: клонирует все таблицы (`cloneTables`,
 * дёшево — см. её комментарий), отдаёт клон колбэку через
 * `StorageWriteTransaction`, и либо целиком заменяет `this.tables` клоном
 * при успехе, либо просто отбрасывает клон при исключении — снаружи ничего
 * не видно, пока транзакция не завершилась успехом (атомарность "видимости
 * извне", не потокобезопасность: JS однопоточен, конкурентных
 * `runTransaction` внутри одного процесса не бывает).
 */
export class InMemoryStorage implements StoragePort {
  private tables: InMemoryTables;
  private readonly query: ReturnType<typeof createQueryPort>;

  constructor(initial: InMemoryTables) {
    this.tables = initial;
    this.query = createQueryPort(() => this.tables);
  }

  get tasks() {
    return this.query.tasks;
  }
  get projects() {
    return this.query.projects;
  }
  get sections() {
    return this.query.sections;
  }
  get labels() {
    return this.query.labels;
  }
  get taskLabels() {
    return this.query.taskLabels;
  }
  get checklistItems() {
    return this.query.checklistItems;
  }
  get reminders() {
    return this.query.reminders;
  }
  get recurrenceSeries() {
    return this.query.recurrenceSeries;
  }
  get attachments() {
    return this.query.attachments;
  }
  get taskLinks() {
    return this.query.taskLinks;
  }
  get importBatches() {
    return this.query.importBatches;
  }
  get syncOutbox() {
    return this.query.syncOutbox;
  }
  get syncConflicts() {
    return this.query.syncConflicts;
  }

  async runTransaction<T>(run: (tx: StorageWriteTransaction) => Promise<T>): Promise<T> {
    const draft = cloneTables(this.tables);
    const tx = createWriteTransaction(draft);
    const result = await run(tx);
    // Колбэк завершился без исключения — коммит: заменяем поколение целиком.
    // Исключение из `run` пролетает мимо этой строки (async/await
    // пробрасывает его вызывающему сам), `draft` просто теряется — откат.
    this.tables = draft;
    return result;
  }

  async eraseAllLocalData(): Promise<void> {
    // Целиком новый набор пустых таблиц, а не `.clear()` по каждой из
    // тринадцати: список таблиц живёт в `createEmptyTables`, и повторять
    // его здесь значило бы завести второй список, который однажды отстанет
    // от первого ровно на ту таблицу, которую забудут стереть.
    this.tables = createEmptyTables();
  }

  async exportAllEntities(): Promise<WorkspaceExport> {
    return {
      projects: alive(this.tables.projects),
      sections: alive(this.tables.sections),
      tasks: alive(this.tables.tasks),
      labels: alive(this.tables.labels),
      taskLabels: [...this.tables.taskLabels.values()],
      checklistItems: alive(this.tables.checklistItems),
      reminders: [...this.tables.reminders.values()],
      recurrenceSeries: [...this.tables.recurrenceSeries.values()],
      taskLinks: [...this.tables.taskLinks.values()],
      attachments: [...this.tables.attachments.values()],
    };
  }

  async purgeExpiredTombstones(now: Temporal.Instant): Promise<TombstonePurgeSummary> {
    const summary: TombstonePurgeSummary = {
      task: purgeTable(this.tables.tasks, now),
      project: purgeTable(this.tables.projects, now),
      section: purgeTable(this.tables.sections, now),
      label: purgeTable(this.tables.labels, now),
      checklistItem: purgeTable(this.tables.checklistItems, now),
    };
    return summary;
  }
}

/** Живые записи таблицы, без tombstone: удалённое остаётся удалённым и в
 * копии (см. `StoragePort.exportAllEntities`). */
function alive<T extends { deletedAt?: Temporal.Instant | null }>(
  table: Map<unknown, T>,
): readonly T[] {
  return [...table.values()].filter((row) => (row.deletedAt ?? null) === null);
}

function purgeTable<K, V extends { deletedAt: Temporal.Instant | null }>(
  table: Map<K, V>,
  now: Temporal.Instant,
): number {
  let removed = 0;
  for (const [key, value] of table) {
    if (value.deletedAt !== null && isTombstoneExpired(value.deletedAt, now)) {
      table.delete(key);
      removed += 1;
    }
  }
  return removed;
}

function createWriteTransaction(draft: InMemoryTables): StorageWriteTransaction {
  const query = createQueryPort(() => draft);
  return {
    ...query,
    async applyMutation(mutation: DomainMutation): Promise<void> {
      applyMutationToTables(draft, mutation);
    },
    async saveImportBatch(batch: ImportBatch): Promise<void> {
      draft.importBatches.set(batch.id, batch);
    },
  };
}

/**
 * Единственное место, где сущность физически попадает в таблицу — и
 * единственное место, где физически попадает outbox-запись. Оба происходят
 * в одном синхронном проходе одной и той же функции: нет способа дойти до
 * первого без второго (задание E02.1: "мимо outbox не записать... не по
 * соглашению, а по типам или по форме API" — рантайм-проверка `isNonEmptyArray`
 * здесь дублирует гарантию типов на случай вызова из нетипизированного кода,
 * см. `test/ports/transaction-outbox-invariant.test.ts`).
 */
function applyMutationToTables(tables: InMemoryTables, mutation: DomainMutation): void {
  if (!isNonEmptyArray(mutation.outbox)) {
    throw new TypeError(
      'applyMutation: outbox обязан содержать хотя бы одну запись (00§7, задание E02.1) — ' +
        'типы это уже запрещают на этапе компиляции, рантайм-проверка здесь на случай ' +
        'вызова из нетипизированного кода.',
    );
  }

  for (const write of mutation.writes) {
    writeEntity(tables, write);
  }

  for (const entry of mutation.outbox) {
    tables.syncOutbox.set(entry.opId, entry);
  }
}

function writeEntity(tables: InMemoryTables, write: DomainMutation['writes'][number]): void {
  switch (write.entity) {
    case 'task':
      tables.tasks.set(write.value.id, write.value);
      return;
    case 'project':
      tables.projects.set(write.value.id, write.value);
      return;
    case 'section':
      tables.sections.set(write.value.id, write.value);
      return;
    case 'label':
      tables.labels.set(write.value.id, write.value);
      return;
    case 'task_label':
      tables.taskLabels.set(taskLabelKey(write.value.taskId, write.value.labelId), write.value);
      return;
    case 'checklist_item':
      tables.checklistItems.set(write.value.id, write.value);
      return;
    case 'reminder':
      tables.reminders.set(write.value.id, write.value);
      return;
    case 'recurrence_series':
      tables.recurrenceSeries.set(write.value.id, write.value);
      return;
    case 'attachment':
      tables.attachments.set(write.value.id, write.value);
      return;
    case 'task_link':
      tables.taskLinks.set(write.value.id, write.value);
      return;
  }
}
