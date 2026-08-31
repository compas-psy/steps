import type {
  CommandDomainMutation,
  CommandStoragePort,
  CommandStorageWriteTransaction,
} from '../../src/commands/storage-port.js';
import type { Task } from '../../src/entities/task.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import type { TaskParentSnapshot, TaskValidationContext } from '../../src/validation/task.js';
import type { Uuid } from '../../src/values.js';

/**
 * Тестовая реализация `CommandStoragePort` — **не** копия
 * `packages/storage/src/memory/` (та — полная эталонная реализация всего
 * контракта хранилища для контрактных тестов `packages/storage`, это другая
 * задача). Здесь — минимум, достаточный, чтобы проверить сами команды: две
 * `Map` в памяти (задачи, outbox), без персистентности, без реального
 * rollback при исключении внутри `runTransaction` (ни одна из четырёх
 * команд этого пакета работ не вызывает `applyMutation` больше одного раза
 * за вызов — атомарность нескольких `applyMutation` в одной транзакции не
 * то, что здесь проверяется).
 */
export class InMemoryCommandStoragePort implements CommandStoragePort {
  private readonly byId = new Map<Uuid, Task>();
  private readonly outboxLog: SyncOutboxEntry[] = [];

  readonly tasks = {
    findById: (id: Uuid): Promise<Task | null> => {
      return Promise.resolve(this.byId.get(id) ?? null);
    },
    loadValidationContext: (
      id: Uuid | null,
      parentTaskId: Uuid | null,
    ): Promise<TaskValidationContext> => {
      const parent = parentTaskId === null ? null : this.loadParentSnapshot(parentTaskId, id);
      return Promise.resolve({
        id,
        parent,
        checklistItemCount: 0,
        labelCount: 0,
        explicitReminderCount: 0,
        linkCount: 0,
        attachmentCount: 0,
      });
    },
  };

  async runTransaction<T>(run: (tx: CommandStorageWriteTransaction) => Promise<T>): Promise<T> {
    const tx: CommandStorageWriteTransaction = {
      tasks: this.tasks,
      applyMutation: (mutation: CommandDomainMutation): Promise<void> => {
        for (const write of mutation.writes) {
          this.byId.set(write.value.id, write.value);
        }
        this.outboxLog.push(...mutation.outbox);
        return Promise.resolve();
      },
    };
    return run(tx);
  }

  private loadParentSnapshot(
    parentTaskId: Uuid,
    excludeId: Uuid | null,
  ): TaskParentSnapshot | null {
    const parent = this.byId.get(parentTaskId);
    if (parent === undefined || parent.deletedAt !== null) {
      return null;
    }
    let directSubtaskCount = 0;
    for (const task of this.byId.values()) {
      if (task.parentTaskId === parentTaskId && task.deletedAt === null && task.id !== excludeId) {
        directSubtaskCount++;
      }
    }
    return {
      id: parent.id,
      projectId: parent.projectId,
      sectionId: parent.sectionId,
      parentTaskId: parent.parentTaskId,
      directSubtaskCount,
    };
  }

  // --- Помощники для тестов (не часть контракта порта) ----------------------

  /** Прямая запись в обход команд — только для расстановки фикстур
   * (существующая задача, которую тест затем обновляет/завершает/удаляет).
   * Ни одна команда сама этим методом не пользуется. */
  seedTask(task: Task): void {
    this.byId.set(task.id, task);
  }

  allTasks(): readonly Task[] {
    return [...this.byId.values()];
  }

  outboxEntries(): readonly SyncOutboxEntry[] {
    return [...this.outboxLog];
  }

  isEmpty(): boolean {
    return this.byId.size === 0 && this.outboxLog.length === 0;
  }
}
