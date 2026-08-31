import type {
  CommandChecklistItemReader,
  CommandDomainMutation,
  CommandStoragePort,
  CommandStorageWriteTransaction,
} from '../../src/commands/storage-port.js';
import type { ChecklistItem } from '../../src/entities/checklist-item.js';
import { isTaskLabelActive, type TaskLabel } from '../../src/entities/task-label.js';
import type { Task, TaskStatus } from '../../src/entities/task.js';
import type { SyncOutboxEntry } from '../../src/entities/sync-outbox.js';
import type { TaskParentSnapshot, TaskValidationContext } from '../../src/validation/task.js';
import type { Uuid } from '../../src/values.js';

/**
 * Тестовая реализация `CommandStoragePort` — **не** копия
 * `packages/storage/src/memory/` (та — полная эталонная реализация всего
 * контракта хранилища для контрактных тестов `packages/storage`, это другая
 * задача). Здесь — минимум, достаточный, чтобы проверить сами команды: `Map`
 * в памяти на задачи/outbox/checklist items/task_labels, без
 * персистентности, без реального rollback при исключении внутри
 * `runTransaction`.
 *
 * `checklistItemsById`/`taskLabelsByKey` — добавлены пакетом работ E10.
 * Единое состояние на весь тестовый мир (а не отдельные несвязанные Map по
 * файлу теста) намеренно: `loadValidationContext(id, ...)` обязан видеть
 * РЕАЛЬНОЕ число активных checklist items/labels задачи `id` (правила 17,
 * 18) — иначе тест на лимит был бы тестом константы `0`, а не тестом
 * реального инварианта. Ровно то же самое верно и для продакшен-хранилища:
 * один `StoragePort` владеет всеми таблицами разом (`packages/storage`),
 * этот класс — его упрощённая in-memory тень с той же связностью.
 */
export class InMemoryCommandStoragePort implements CommandStoragePort {
  private readonly byId = new Map<Uuid, Task>();
  private readonly outboxLog: SyncOutboxEntry[] = [];
  private readonly checklistItemsById = new Map<Uuid, ChecklistItem>();
  private readonly taskLabelsByKey = new Map<string, TaskLabel>();

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
        checklistItemCount: id === null ? 0 : this.countActiveChecklistItemsFor(id),
        labelCount: id === null ? 0 : this.countActiveLabelsFor(id),
        explicitReminderCount: 0,
        linkCount: 0,
        attachmentCount: 0,
      });
    },
    listDirectSubtasks: (parentTaskId: Uuid, status: TaskStatus): Promise<readonly Task[]> => {
      return Promise.resolve(
        [...this.byId.values()].filter(
          (task) =>
            task.parentTaskId === parentTaskId && task.status === status && task.deletedAt === null,
        ),
      );
    },
  };

  readonly checklistItems: CommandChecklistItemReader = {
    listByTask: (taskId: Uuid): Promise<readonly ChecklistItem[]> => {
      return Promise.resolve(
        [...this.checklistItemsById.values()].filter(
          (item) => item.taskId === taskId && item.deletedAt === null,
        ),
      );
    },
    countActiveByTask: (taskId: Uuid): Promise<number> => {
      return Promise.resolve(this.countActiveChecklistItemsFor(taskId));
    },
  };

  async runTransaction<T>(run: (tx: CommandStorageWriteTransaction) => Promise<T>): Promise<T> {
    const tx: CommandStorageWriteTransaction = {
      tasks: this.tasks,
      checklistItems: this.checklistItems,
      applyMutation: (mutation: CommandDomainMutation): Promise<void> => {
        for (const write of mutation.writes) {
          if (write.entity === 'task') {
            this.byId.set(write.value.id, write.value);
          } else {
            this.checklistItemsById.set(write.value.id, write.value);
          }
        }
        this.outboxLog.push(...mutation.outbox);
        return Promise.resolve();
      },
    };
    return run(tx);
  }

  private countActiveChecklistItemsFor(taskId: Uuid): number {
    let count = 0;
    for (const item of this.checklistItemsById.values()) {
      if (item.taskId === taskId && item.deletedAt === null) count++;
    }
    return count;
  }

  private countActiveLabelsFor(taskId: Uuid): number {
    let count = 0;
    for (const link of this.taskLabelsByKey.values()) {
      if (link.taskId === taskId && isTaskLabelActive(link)) count++;
    }
    return count;
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
    return (
      this.byId.size === 0 && this.outboxLog.length === 0 && this.checklistItemsById.size === 0
    );
  }

  /** Прямая запись checklist item в обход команд — фикстура. */
  seedChecklistItem(item: ChecklistItem): void {
    this.checklistItemsById.set(item.id, item);
  }

  findChecklistItem(id: Uuid): ChecklistItem | null {
    return this.checklistItemsById.get(id) ?? null;
  }

  allChecklistItems(): readonly ChecklistItem[] {
    return [...this.checklistItemsById.values()];
  }

  /**
   * `task_labels` — часть этого же общего тестового мира (см. комментарий
   * класса), но НЕ часть `CommandStoragePort`/`CommandChecklistItemReader`
   * (Label/TaskLabel — отдельные, независимые порты, `label-port.ts`/
   * `task-label-port.ts`). Эти методы дают тестам label/task-label команд
   * построить свой узкий `CommandTaskLabelStoragePort`, читающий/пишущий
   * ровно в это же состояние — тогда `tasks.loadValidationContext` этого же
   * инстанса видит те же связи (правило 18), как в продакшене один
   * `StoragePort` видит все свои таблицы разом.
   */
  seedTaskLabel(link: TaskLabel): void {
    this.taskLabelsByKey.set(taskLabelKey(link.taskId, link.labelId), link);
  }

  writeTaskLabel(link: TaskLabel): void {
    this.taskLabelsByKey.set(taskLabelKey(link.taskId, link.labelId), link);
  }

  findTaskLabel(taskId: Uuid, labelId: Uuid): TaskLabel | null {
    return this.taskLabelsByKey.get(taskLabelKey(taskId, labelId)) ?? null;
  }

  listTaskLabelsByTask(taskId: Uuid): readonly TaskLabel[] {
    return [...this.taskLabelsByKey.values()].filter((link) => link.taskId === taskId);
  }

  listTaskLabelsByLabel(labelId: Uuid): readonly TaskLabel[] {
    return [...this.taskLabelsByKey.values()].filter((link) => link.labelId === labelId);
  }
}

function taskLabelKey(taskId: Uuid, labelId: Uuid): string {
  return `${taskId}:${labelId}`;
}
