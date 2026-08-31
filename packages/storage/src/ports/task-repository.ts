import type { Temporal } from '@js-temporal/polyfill';
import type {
  CaptureState,
  Task,
  TaskParentSnapshot,
  TaskValidationContext,
  Uuid,
} from '@shagi/core';

/**
 * Только чтение — `Task` записывается исключительно через
 * `StorageWriteTransaction.applyMutation` (`./transaction.ts`). Здесь
 * специально нет `save`/`upsert`/`delete`: если бы такой метод существовал,
 * его можно было бы вызвать в обход outbox, а задание пакета работ E02.1
 * требует, чтобы это было невозможно по форме API, а не по соглашению.
 *
 * Список методов список выбран под девять индексов конспекта §7, а не
 * "что покажется полезным": каждый метод — это ровно один из индексов
 * `tasks(...)`, плюс два вспомогательных метода, напрямую возвращающих типы
 * валидатора `@shagi/core` (`TaskParentSnapshot`, `TaskValidationContext`) —
 * так вызывающий командный слой (следующий пакет работ) получает контекст
 * валидации одним вызовом, без ручной сборки среза по нескольким запросам.
 *
 * Все `list*`-методы по умолчанию исключают tombstone (`deletedAt !== null`)
 * — tombstone не user-visible статус (`02§1`), обычные запросы не должны
 * его видеть без явного намерения. `findById` — сырое чтение, tombstone
 * включительно (нужно sync-слою и восстановлению).
 */
export interface TaskRepository {
  findById(id: Uuid): Promise<Task | null>;

  /** Индекс `tasks(status, planned_date)` — упорядочено по `plannedDate`. */
  listByStatusAndPlannedDate(status: Task['status']): Promise<readonly Task[]>;

  /** Индекс `tasks(status, deadline_date)` — упорядочено по `deadlineDate`. */
  listByStatusAndDeadlineDate(status: Task['status']): Promise<readonly Task[]>;

  /** Индекс `tasks(capture_state, status)`. */
  listByCaptureStateAndStatus(
    captureState: CaptureState,
    status: Task['status'],
  ): Promise<readonly Task[]>;

  /** Индекс `tasks(project_id, section_id, status, rank)` — упорядочено по `rank`. */
  listByProjectSection(
    projectId: Uuid,
    sectionId: Uuid | null,
    status: Task['status'],
  ): Promise<readonly Task[]>;

  /** Индекс `tasks(parent_task_id, status, rank)` — упорядочено по `rank`. */
  listDirectSubtasks(parentTaskId: Uuid, status: Task['status']): Promise<readonly Task[]>;

  /** Индекс `tasks(focus_date, status)`. */
  listByFocusDate(focusDate: Temporal.PlainDate, status: Task['status']): Promise<readonly Task[]>;

  /** Индекс `tasks(series_id, status)`. */
  listBySeries(seriesId: Uuid, status: Task['status']): Promise<readonly Task[]>;

  /** Правило 16 конспекта (`@shagi/core` §2): число прямых subtasks
   * родителя, живых (не tombstone). */
  countDirectSubtasks(parentTaskId: Uuid): Promise<number>;

  /** Снимок родителя для правил 6–9, 16 (`TaskParentSnapshot`,
   * `@shagi/core` `validation/task.ts`) — `null`, если родителя нет. */
  loadParentSnapshot(parentTaskId: Uuid): Promise<TaskParentSnapshot | null>;

  /**
   * Готовый `TaskValidationContext` (`@shagi/core`) для `validateTask` —
   * собирает снимок родителя и все пять счётчиков лимитов (правила 16–21)
   * одним вызовом. `id=null` для ещё не созданной задачи;
   * `parentTaskId=null`, если задача не будет дочерней (тогда `parent`
   * в результате тоже `null`, без обращения к хранилищу за снимком).
   */
  loadValidationContext(id: Uuid | null, parentTaskId: Uuid | null): Promise<TaskValidationContext>;
}
