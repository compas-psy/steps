import { Temporal } from '@js-temporal/polyfill';
import { validateTask, type Task, type TaskValidationInput } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { StoragePort } from '../ports/index.js';

import {
  makeChecklistItem,
  makeHlc,
  makeOutboxEntry,
  makeProject,
  makeTask,
  makeTaskLabel,
  newId,
  nextInstant,
} from './fixtures.js';

function toValidationInput(task: Task): TaskValidationInput {
  return {
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    sectionId: task.sectionId,
    parentTaskId: task.parentTaskId,
    captureState: task.captureState,
    seriesId: task.seriesId,
    availableFrom: task.availableFrom,
    plannedDate: task.plannedDate,
    plannedTime: task.plannedTime,
    durationMin: task.durationMin,
    focusDate: task.focusDate,
    dayBucket: task.dayBucket,
    deadlineDate: task.deadlineDate,
    deadlineTime: task.deadlineTime,
    status: task.status,
    completedAt: task.completedAt,
    completionKind: task.completionKind,
    priority: task.priority,
  };
}

/**
 * Общий набор тестов контракта `StoragePort` (задание пакета работ E02.1,
 * п.7). Прогоняется сейчас против эталонной реализации в памяти
 * (`../memory`, `test/memory/storage-contract.test.ts`); в следующих
 * пакетах работ — против SQLite и IndexedDB адаптеров БЕЗ ИЗМЕНЕНИЙ (только
 * замена `factory`) — так гарантируется, что семантика не разъедется между
 * тремя реализациями (`02§4`).
 *
 * `name` попадает в заголовок `describe`, чтобы отчёт vitest различал, какая
 * реализация прогонялась, когда тест запущен против нескольких сразу.
 */
export function runStorageContract(name: string, factory: () => StoragePort): void {
  describe(`контракт StoragePort — ${name}`, () => {
    describe('пустое хранилище', () => {
      it('репозитории не падают и возвращают пусто/ноль', async () => {
        const storage = factory();
        await expect(storage.tasks.listByStatusAndPlannedDate('active')).resolves.toEqual([]);
        await expect(storage.projects.listActive()).resolves.toEqual([]);
        await expect(storage.projects.countActiveExcluding(null)).resolves.toBe(0);
        await expect(storage.syncOutbox.listPending()).resolves.toEqual([]);
        await expect(storage.tasks.findById(newId())).resolves.toBeNull();
      });
    });

    describe('applyMutation — сущность и outbox атомарно', () => {
      it('запись задачи видна через findById, outbox-запись — через syncOutbox', async () => {
        const storage = factory();
        const task = makeTask();
        const outboxEntry = makeOutboxEntry('task', task.id);

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [{ entity: 'task', value: task }],
            outbox: [outboxEntry],
          });
        });

        await expect(storage.tasks.findById(task.id)).resolves.toEqual(task);
        const pending = await storage.syncOutbox.listPending();
        expect(pending).toHaveLength(1);
        expect(pending[0]?.opId).toBe(outboxEntry.opId);
      });

      it('несколько сущностей и несколько outbox-записей одной мутацией', async () => {
        const storage = factory();
        const project = makeProject();
        const task = makeTask({ projectId: project.id });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'project', value: project },
              { entity: 'task', value: task },
            ],
            outbox: [makeOutboxEntry('project', project.id), makeOutboxEntry('task', task.id)],
          });
        });

        await expect(storage.projects.findById(project.id)).resolves.toEqual(project);
        await expect(storage.tasks.findById(task.id)).resolves.toEqual(task);
        await expect(storage.syncOutbox.countPending()).resolves.toBe(2);
      });
    });

    describe('runTransaction — атомарность видимости', () => {
      it('коммитит эффекты, только когда колбэк не бросил', async () => {
        const storage = factory();
        const task = makeTask();

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [{ entity: 'task', value: task }],
            outbox: [makeOutboxEntry('task', task.id)],
          });
        });

        await expect(storage.tasks.findById(task.id)).resolves.not.toBeNull();
      });

      it('откатывает целиком, если колбэк бросил после applyMutation', async () => {
        const storage = factory();
        const task = makeTask();

        await expect(
          storage.runTransaction(async (tx) => {
            await tx.applyMutation({
              writes: [{ entity: 'task', value: task }],
              outbox: [makeOutboxEntry('task', task.id)],
            });
            throw new Error('намеренный сбой посреди транзакции');
          }),
        ).rejects.toThrow('намеренный сбой');

        await expect(storage.tasks.findById(task.id)).resolves.toBeNull();
        await expect(storage.syncOutbox.countPending()).resolves.toBe(0);
      });

      it('read-your-writes: чтение внутри транзакции видит её же ещё не закоммиченную запись', async () => {
        const storage = factory();
        const task = makeTask();

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [{ entity: 'task', value: task }],
            outbox: [makeOutboxEntry('task', task.id)],
          });
          const seenInsideTransaction = await tx.tasks.findById(task.id);
          expect(seenInsideTransaction).toEqual(task);
        });
      });
    });

    describe('TaskRepository — выборки по индексам конспекта §7', () => {
      it('listByProjectSection: null sectionId — только задачи без секции', async () => {
        const storage = factory();
        const project = makeProject();
        const inSection = makeTask({ projectId: project.id, sectionId: newId() });
        const noSection = makeTask({ projectId: project.id, sectionId: null });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'task', value: inSection },
              { entity: 'task', value: noSection },
            ],
            outbox: [makeOutboxEntry('task', inSection.id), makeOutboxEntry('task', noSection.id)],
          });
        });

        const result = await storage.tasks.listByProjectSection(project.id, null, 'active');
        expect(result.map((task) => task.id)).toEqual([noSection.id]);
      });

      it('listDirectSubtasks + countDirectSubtasks согласованы', async () => {
        const storage = factory();
        const parent = makeTask();
        const childA = makeTask({ parentTaskId: parent.id });
        const childB = makeTask({ parentTaskId: parent.id });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'task', value: parent },
              { entity: 'task', value: childA },
              { entity: 'task', value: childB },
            ],
            outbox: [
              makeOutboxEntry('task', parent.id),
              makeOutboxEntry('task', childA.id),
              makeOutboxEntry('task', childB.id),
            ],
          });
        });

        const subtasks = await storage.tasks.listDirectSubtasks(parent.id, 'active');
        expect(subtasks).toHaveLength(2);
        await expect(storage.tasks.countDirectSubtasks(parent.id)).resolves.toBe(2);
      });

      it('listBySeries упорядочен по occurrenceSeq', async () => {
        const storage = factory();
        const seriesId = newId();
        const second = makeTask({ seriesId, occurrenceSeq: 2n });
        const first = makeTask({ seriesId, occurrenceSeq: 1n });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'task', value: second },
              { entity: 'task', value: first },
            ],
            outbox: [makeOutboxEntry('task', second.id), makeOutboxEntry('task', first.id)],
          });
        });

        const result = await storage.tasks.listBySeries(seriesId, 'active');
        expect(result.map((task) => task.id)).toEqual([first.id, second.id]);
      });
    });

    describe('TaskLabel — OR-set по HLC', () => {
      it('countActiveByTask реагирует на addHlc/removeHlc одной и той же пары', async () => {
        const storage = factory();
        const taskId = newId();
        const labelId = newId();
        const addedAt = makeHlc(nextInstant());

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [{ entity: 'task_label', value: makeTaskLabel(taskId, labelId, addedAt) }],
            outbox: [makeOutboxEntry('task_label', taskId)],
          });
        });
        await expect(storage.taskLabels.countActiveByTask(taskId)).resolves.toBe(1);

        const removedAt = makeHlc(nextInstant());
        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'task_label', value: makeTaskLabel(taskId, labelId, addedAt, removedAt) },
            ],
            outbox: [makeOutboxEntry('task_label', taskId)],
          });
        });
        await expect(storage.taskLabels.countActiveByTask(taskId)).resolves.toBe(0);

        const links = await storage.taskLabels.listByTask(taskId);
        expect(links).toHaveLength(1); // upsert по (taskId, labelId), не вторая строка
      });
    });

    describe('Tombstone', () => {
      it('живые списки исключают tombstone, findById его всё ещё видит', async () => {
        const storage = factory();
        const alive = makeProject();
        const tombstoned = makeProject({ deletedAt: nextInstant() });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'project', value: alive },
              { entity: 'project', value: tombstoned },
            ],
            outbox: [
              makeOutboxEntry('project', alive.id),
              makeOutboxEntry('project', tombstoned.id),
            ],
          });
        });

        const active = await storage.projects.listActive();
        expect(active.map((project) => project.id)).toEqual([alive.id]);
        await expect(storage.projects.findById(tombstoned.id)).resolves.not.toBeNull();
      });

      it('purgeExpiredTombstones стирает только просроченные (>90 дней) записи', async () => {
        const storage = factory();
        const epoch = Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000);
        const expiredDeletedAt = epoch;
        const freshDeletedAt = epoch.add({ hours: 10 });
        const expired = makeProject({ deletedAt: expiredDeletedAt });
        const fresh = makeProject({ deletedAt: freshDeletedAt });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'project', value: expired },
              { entity: 'project', value: fresh },
            ],
            outbox: [makeOutboxEntry('project', expired.id), makeOutboxEntry('project', fresh.id)],
          });
        });

        const now = epoch.add({ hours: 90 * 24 + 1 });
        const summary = await storage.purgeExpiredTombstones(now);
        expect(summary.project).toBe(1);

        await expect(storage.projects.findById(expired.id)).resolves.toBeNull();
        await expect(storage.projects.findById(fresh.id)).resolves.not.toBeNull();
      });

      it('eraseAllLocalData стирает всё: и живые записи, и tombstone, и очередь синхронизации', async () => {
        const storage = factory();
        const project = makeProject();
        const task = makeTask({ projectId: project.id });
        const tombstoned = makeProject({
          deletedAt: Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000),
        });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'project', value: project },
              { entity: 'project', value: tombstoned },
              { entity: 'task', value: task },
            ],
            outbox: [makeOutboxEntry('task', task.id)],
          });
        });

        await storage.eraseAllLocalData();

        // Проверяются ВСЕ три вида содержимого, а не только очевидные
        // задачи: наполовину стёртое хранилище хуже нестёртого — человек
        // считает, что данных нет, а часть осталась.
        await expect(storage.tasks.findById(task.id)).resolves.toBeNull();
        await expect(storage.projects.findById(project.id)).resolves.toBeNull();
        await expect(storage.projects.findById(tombstoned.id)).resolves.toBeNull();
        await expect(storage.syncOutbox.listPending()).resolves.toEqual([]);
      });

      it('exportAllEntities отдаёт ВСЁ, включая задачу без даты, проекта и родителя', async () => {
        // Именно этот случай и есть причина отдельного метода: такая
        // задача не попадает ни в одну индексную выборку репозиториев, и
        // бэкап, собранный из них, потерял бы её молча.
        const storage = factory();
        const project = makeProject();
        const orphan = makeTask({ title: 'Ничья задача' });
        const inProject = makeTask({ projectId: project.id });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'project', value: project },
              { entity: 'task', value: orphan },
              { entity: 'task', value: inProject },
            ],
            outbox: [makeOutboxEntry('task', orphan.id)],
          });
        });

        const exported = await storage.exportAllEntities();
        expect(exported.projects).toHaveLength(1);
        expect(exported.tasks.map((task) => task.id).toSorted()).toEqual(
          [orphan.id, inProject.id].toSorted(),
        );
      });

      it('dumpForMigration отдаёт ВСЁ: tombstone, очередь синхронизации и партии импорта', async () => {
        // Перенос backend'а (ADR-0005) — не бэкап: потерять tombstone
        // значит воскресить удалённое при следующей синхронизации,
        // потерять outbox — не отправить уже сделанные изменения.
        const storage = factory();
        const alive = makeTask({ title: 'Живая' });
        const removed = makeTask({
          title: 'Удалённая',
          deletedAt: Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000),
        });
        const entry = makeOutboxEntry('task', alive.id);
        const startedAt = Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000);

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'task', value: alive },
              { entity: 'task', value: removed },
            ],
            outbox: [entry],
          });
          await tx.saveImportBatch({
            id: makeProject().id,
            source: 'todoist_csv',
            startedAt,
            finishedAt: null,
            rollbackDeadline: startedAt.add({ minutes: 10 }),
            status: 'applied',
            reportJson: {},
          });
        });

        const dump = await storage.dumpForMigration();
        expect(dump.tasks.map((task) => task.title).toSorted()).toEqual(['Живая', 'Удалённая']);
        expect(dump.syncOutbox.map((row) => row.opId)).toEqual([entry.opId]);
        expect(dump.importBatches).toHaveLength(1);
      });

      it('loadFromMigrationDump переносит состояние целиком в пустое хранилище', async () => {
        const source = factory();
        const project = makeProject();
        const parent = makeTask({ title: 'Родитель', projectId: project.id });
        const child = makeTask({
          title: 'Подзадача',
          projectId: project.id,
          parentTaskId: parent.id,
        });
        const removed = makeTask({
          title: 'Удалённая',
          deletedAt: Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000),
        });
        const entry = makeOutboxEntry('task', parent.id);

        await source.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'project', value: project },
              { entity: 'task', value: parent },
              { entity: 'task', value: child },
              { entity: 'task', value: removed },
            ],
            outbox: [entry],
          });
        });

        const target = factory();
        await target.loadFromMigrationDump(await source.dumpForMigration());
        const moved = await target.dumpForMigration();

        expect(moved.tasks.map((task) => task.id).toSorted()).toEqual(
          [parent.id, child.id, removed.id].toSorted(),
        );
        // Иерархия и ссылка на проект — не «примерно те же данные», а те же.
        expect(moved.tasks.find((task) => task.id === child.id)?.parentTaskId).toBe(parent.id);
        expect(moved.tasks.find((task) => task.id === parent.id)?.projectId).toBe(project.id);
        // Tombstone остался tombstone'ом, а не воскрес живой задачей.
        // (`findById` — сырое чтение, tombstone включительно, см.
        // `ports/task-repository.ts`; поэтому проверяется само поле и
        // отсутствие записи в пользовательских выборках.)
        expect(moved.tasks.find((task) => task.id === removed.id)?.deletedAt).not.toBeNull();
        expect(await target.exportAllEntities()).toMatchObject({
          tasks: expect.not.arrayContaining([expect.objectContaining({ id: removed.id })]),
        });
        // Очередь синхронизации переехала как есть.
        expect(moved.syncOutbox.map((row) => row.opId)).toEqual([entry.opId]);
        // И новых записей в очереди перенос НЕ породил.
        expect(moved.syncOutbox).toHaveLength(1);
      });

      it('exportAllEntities не отдаёт удалённое (tombstone)', async () => {
        const storage = factory();
        const alive = makeTask({ title: 'Живая' });
        const removed = makeTask({
          title: 'Удалённая',
          deletedAt: Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000),
        });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'task', value: alive },
              { entity: 'task', value: removed },
            ],
            outbox: [makeOutboxEntry('task', alive.id)],
          });
        });

        const exported = await storage.exportAllEntities();
        expect(exported.tasks).toHaveLength(1);
        expect(exported.tasks[0]?.id).toBe(alive.id);
      });

      it('saveImportBatch пишет партию импорта и обновляет её по тому же id', async () => {
        // `import_batches` не входит в `EntityType` и пишется своим методом
        // (`01§26`, разбор — в `StorageWriteTransaction.saveImportBatch`).
        // Проверяется здесь, в общем контракте, а не в тестах одного
        // адаптера: иначе поведение разъедется между SQLite и IndexedDB.
        const storage = factory();
        const startedAt = Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000);
        const batch = {
          id: makeProject().id,
          source: 'todoist_csv',
          startedAt,
          finishedAt: null,
          rollbackDeadline: startedAt.add({ minutes: 10 }),
          status: 'applied',
          reportJson: { tasks: 3 },
        };

        await storage.runTransaction(async (tx) => {
          await tx.saveImportBatch(batch);
        });
        const stored = await storage.importBatches.findById(batch.id);
        expect(stored?.status).toBe('applied');
        expect(stored?.reportJson).toEqual({ tasks: 3 });
        expect(stored?.rollbackDeadline.epochMilliseconds).toBe(
          batch.rollbackDeadline.epochMilliseconds,
        );

        // Откат импорта помечает ТУ ЖЕ партию, а не заводит вторую.
        await storage.runTransaction(async (tx) => {
          await tx.saveImportBatch({ ...batch, status: 'rolled_back', finishedAt: startedAt });
        });
        const updated = await storage.importBatches.findById(batch.id);
        expect(updated?.status).toBe('rolled_back');
        expect(updated?.finishedAt?.epochMilliseconds).toBe(startedAt.epochMilliseconds);
      });

      it('откат транзакции отменяет и запись партии импорта', async () => {
        const storage = factory();
        const startedAt = Temporal.Instant.fromEpochMilliseconds(1_700_000_000_000);
        const batch = {
          id: makeProject().id,
          source: 'todoist_csv',
          startedAt,
          finishedAt: null,
          rollbackDeadline: startedAt.add({ minutes: 10 }),
          status: 'applied',
          reportJson: {},
        };

        await expect(
          storage.runTransaction(async (tx) => {
            await tx.saveImportBatch(batch);
            throw new Error('сбой посреди импорта');
          }),
        ).rejects.toThrow('сбой посреди импорта');

        // Партия — часть той же транзакции, что и импортируемые сущности:
        // если транзакция не состоялась, следа импорта остаться не должно.
        await expect(storage.importBatches.findById(batch.id)).resolves.toBeNull();
      });

      it('после eraseAllLocalData хранилищем можно продолжать пользоваться', async () => {
        const storage = factory();
        const before = makeProject();
        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [{ entity: 'project', value: before }],
            outbox: [makeOutboxEntry('project', before.id)],
          });
        });

        await storage.eraseAllLocalData();

        // Стирание — не «закрыть базу»: экран настроек остаётся открытым, и
        // человек сразу заводит первую задачу заново.
        const fresh = makeProject();
        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [{ entity: 'project', value: fresh }],
            outbox: [makeOutboxEntry('project', fresh.id)],
          });
        });
        await expect(storage.projects.findById(fresh.id)).resolves.not.toBeNull();
      });
    });

    describe('Интеграция с валидатором @shagi/core — не второй валидатор, а прямое использование', () => {
      it('loadValidationContext даёт корректный TaskParentSnapshot, и validateTask принимает результат', async () => {
        const storage = factory();
        const parent = makeTask();
        const existingChildA = makeTask({ parentTaskId: parent.id });
        const existingChildB = makeTask({ parentTaskId: parent.id });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'task', value: parent },
              { entity: 'task', value: existingChildA },
              { entity: 'task', value: existingChildB },
            ],
            outbox: [
              makeOutboxEntry('task', parent.id),
              makeOutboxEntry('task', existingChildA.id),
              makeOutboxEntry('task', existingChildB.id),
            ],
          });
        });

        const context = await storage.tasks.loadValidationContext(null, parent.id);
        expect(context.parent?.directSubtaskCount).toBe(2);

        const newChildCandidate = makeTask({ parentTaskId: parent.id });
        const result = validateTask(toValidationInput(newChildCandidate), context);
        expect(result.valid).toBe(true);
      });

      it('счётчик меток из storage триггерит настоящее блокирующее правило 18 @shagi/core', async () => {
        const storage = factory();
        const task = makeTask();
        const overLimit = 51; // лимит — 50 (правило 18)

        await storage.runTransaction(async (tx) => {
          for (let i = 0; i < overLimit; i += 1) {
            await tx.applyMutation({
              writes: [
                {
                  entity: 'task_label',
                  value: makeTaskLabel(task.id, newId(), makeHlc(nextInstant())),
                },
              ],
              outbox: [makeOutboxEntry('task_label', task.id)],
            });
          }
        });

        const context = await storage.tasks.loadValidationContext(task.id, null);
        expect(context.labelCount).toBe(overLimit);

        const result = validateTask(toValidationInput(task), context);
        expect(result.valid).toBe(false);
        expect(result.issues.some((issue) => issue.code === 'TASK_LABEL_LIMIT_EXCEEDED')).toBe(
          true,
        );
      });
    });

    describe('ChecklistItem', () => {
      it('tombstone-пункты не считаются в countActiveByTask', async () => {
        const storage = factory();
        const task = makeTask();
        const alive = makeChecklistItem(task.id);
        const tombstoned = makeChecklistItem(task.id, { deletedAt: nextInstant() });

        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [
              { entity: 'checklist_item', value: alive },
              { entity: 'checklist_item', value: tombstoned },
            ],
            outbox: [
              makeOutboxEntry('checklist_item', task.id),
              makeOutboxEntry('checklist_item', task.id),
            ],
          });
        });

        await expect(storage.checklistItems.countActiveByTask(task.id)).resolves.toBe(1);
      });
    });
  });
}
