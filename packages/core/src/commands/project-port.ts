import type { Temporal } from '@js-temporal/polyfill';

import type { Project } from '../entities/project.js';
import type { Reminder } from '../entities/reminder.js';
import type { Task, TaskStatus } from '../entities/task.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { ValidationResult } from '../validation/types.js';
import type { ProjectMutationOrigin } from '../validation/project.js';
import type { Uuid } from '../values.js';
import type { NonEmptyArray } from './storage-port.js';

/**
 * Порт хранения командного слоя Project — тот же приём инверсии
 * зависимости, что `commands/storage-port.ts` (Task) и `commands/reminder-port.ts`
 * (Reminder), см. ADR-0003: `@shagi/core` не может импортировать
 * `ProjectRepository`/`StoragePort` из `@shagi/storage` (цикл
 * `storage → core → storage`), поэтому здесь заведён собственный, узкий,
 * структурно совместимый интерфейс — реальный `StoragePort` подходит без
 * адаптера (метод-синтаксис, бивариантные параметры — разбор в
 * `commands/storage-port.ts`).
 *
 * `CommandProjectReader` — структурный срез `ProjectRepository`
 * (`packages/storage/src/ports/project-repository.ts`): `findById` — чтобы
 * `update`/`archive`/`unarchive`/`delete` могли загрузить текущее
 * состояние (сырое чтение, tombstone включительно — то же соглашение, что
 * у `CommandTaskReader.findById`); `countActiveExcluding` — прямой вход
 * `ProjectValidationContext.activeProjectCountExcludingThis` (правила 27,
 * 28), `excludingId=null` для ещё не созданного проекта.
 */
export interface CommandProjectReader {
  findById(id: Uuid): Promise<Project | null>;
  countActiveExcluding(excludingId: Uuid | null): Promise<number>;
}

/** Единственная форма записи Project — узкое (только `entity:'project'`)
 * подмножество `EntityWrite` (`packages/storage/src/ports/transaction.ts`). */
export interface CommandProjectEntityWrite {
  readonly entity: 'project';
  readonly value: Project;
}

export interface CommandProjectDomainMutation {
  readonly writes: readonly CommandProjectEntityWrite[];
  readonly outbox: NonEmptyArray<SyncOutboxEntry>;
}

export interface CommandProjectWriteTransaction {
  applyMutation(mutation: CommandProjectDomainMutation): Promise<void>;
}

export interface CommandProjectStoragePort {
  readonly projects: CommandProjectReader;
  runTransaction<T>(run: (tx: CommandProjectWriteTransaction) => Promise<T>): Promise<T>;
}

/**
 * Узкий срез `TaskRepository.listByProjectSection` (`packages/storage`,
 * вне территории — не импортируется, заведён заново по той же причине
 * цикла). Нужен `archiveProjectCommand` (перечислить активные задачи
 * проекта перед отменой их напоминаний, `01§12` "Archiving immediately
 * cancels... notifications belonging to active tasks in that Project") и
 * обеим командам permanent delete (`project-delete.ts`, перенести/удалить
 * задачи проекта). У реального `TaskRepository` нет метода "все задачи
 * проекта вне зависимости от секции" — только по одной секции за раз
 * (`section_id` — часть составного индекса), поэтому команда обходит
 * секции проекта сама (см. `project-archive.ts`/`project-delete.ts`,
 * функция `listAllProjectTasks`).
 */
export interface CommandProjectTaskReader {
  listByProjectSection(
    projectId: Uuid,
    sectionId: Uuid | null,
    status: TaskStatus,
  ): Promise<readonly Task[]>;
}

/** Узкий срез `ReminderRepository.listByTask` — нужен `archiveProjectCommand`,
 * чтобы найти включённые напоминания задачи перед вызовом
 * `cancelReminderCommand` (`reminder-cancel.ts`, уже готов). */
export interface CommandProjectReminderReader {
  listByTask(taskId: Uuid): Promise<readonly Reminder[]>;
}

/** Зависимости `createProjectCommand`/`updateProjectCommand` — только
 * чтение/запись Project, без cross-entity вызовов. */
export interface ProjectCommandDeps {
  readonly storage: CommandProjectStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateId?: () => Uuid;
  readonly generateOpId?: () => Uuid;
}

/**
 * Итог команд Project, у которых есть ровно эти три исхода (create/update) —
 * та же форма, что `TaskCommandResult` (`commands/types.ts`): `rejected` не
 * бросает исключение, несёт `ValidationResult` целиком; `not_found` —
 * адресуемая по `id` команда не нашла живую (не tombstone) запись.
 * Архивация/разархивация/permanent delete используют собственные, более
 * широкие результаты (см. `project-archive.ts`/`project-delete.ts`) —
 * им есть что сообщить сверх этих трёх исходов (были ли активные задачи,
 * сколько напоминаний отменено, сколько задач перенесено/удалено), но
 * базовый успех/rejected/not_found у них тот же самый набор веток, поэтому
 * они переиспользуют эту форму как основу через intersection, не
 * копируя её вручную.
 */
export type ProjectCommandResult =
  | { readonly status: 'ok'; readonly project: Project }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

/**
 * `ProjectMutationOrigin` (`@shagi/core/validation`, вне территории —
 * `validation/project.ts` в списке "НЕ трогай") различает ровно два
 * гейтящихся значения (`create`/`reactivate`, правила 27/28) и три
 * негейтящихся, зарезервированных под миграцию (`import`/`restore`/
 * `account_merge`). Пятого значения "обычная правка полей, число активных
 * проектов не меняется" в типе нет — добавить его нельзя, файл вне
 * территории.
 *
 * `updateProjectCommand` (правка title/description/colorToken/icon/
 * defaultView/favorite/rank) и `archiveProjectCommand` (переход в архив —
 * число активных УМЕНЬШАЕТСЯ, не растёт, гейт 27/28 по построению не может
 * сработать) не гейтятся в принципе. Единственное, что для них имеет
 * значение — происхождение НЕ входит в `GATED_ORIGINS`
 * (`validation/project.ts`); из трёх негейтящихся значений ни одно не
 * описывает точно "обычная правка", но снаружи это неразличимо: все три
 * дают идентичный `ValidationResult` для одних и тех же title/description
 * (см. `checkProjectLimits` там же — единственная ветка, которая читает
 * `origin`, полностью пропускает её при любом негейтящемся значении).
 * `'import'` выбран как нейтральный маркер "не гейтить".
 */
export const UNGATED_PROJECT_ORIGIN: ProjectMutationOrigin = 'import';

/** Поля Project, участвующие в per-field HLC (`entities/project.ts`) —
 * всё изменяемое множество, кроме `id`/`createdAt` (у Project нет
 * `revision`, в отличие от Task — `entities/project.ts` не перечисляет
 * это поле, см. отчёт пакета работ). */
export const PROJECT_MUTABLE_FIELDS = [
  'title',
  'description',
  'colorToken',
  'icon',
  'defaultView',
  'favorite',
  'archivedAt',
  'rank',
  'deletedAt',
] as const;
