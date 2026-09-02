/**
 * Применение и откат импорта — против НАСТОЯЩЕГО хранилища
 * (`InMemoryStorage` — эталонная реализация `StoragePort`, тот же контракт,
 * что у SQLite/IndexedDB) и НАСТОЯЩИХ файлов из `test/fixtures`.
 * Ни одного мока: проверяется то, что реально оказалось в хранилище.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Temporal } from '@js-temporal/polyfill';
import { asUuid, type Uuid } from '@shagi/core';
import { createInMemoryStorage } from '@shagi/storage';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyTodoistImport,
  canRollbackImport,
  parseTodoistCsv,
  rollbackImport,
} from '../src/index.js';

const NOW = Temporal.Instant.from('2026-09-02T09:00:00Z');
const DEVICE = asUuid('01a06322-0000-7000-8000-00000000dev1'.replace('dev1', '0001'));
const OWNER = asUuid('01a06322-0000-7000-8000-000000000002');

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

function planFrom(name: string, projectName: string) {
  const result = parseTodoistCsv(projectName, fixture(name));
  if (result.status !== 'ok') throw new Error(`фикстура не разобралась: ${name}`);
  return result.plan;
}

/** Полный список активных задач: индексные выборки хранилища заточены под
 * конкретные экраны (по дате, по проекту), а проверять надо ВСЁ, что
 * доехало, включая задачи без даты. */
async function allActiveTasks(storage: ReturnType<typeof createInMemoryStorage>) {
  const projects = await storage.projects.listActive();
  const collected = [];
  for (const project of projects) {
    const sections = await storage.sections.listByProject(project.id);
    for (const sectionId of [null, ...sections.map((section) => section.id)]) {
      collected.push(
        ...(await storage.tasks.listByProjectSection(project.id, sectionId, 'active')),
      );
    }
  }
  collected.push(...(await storage.tasks.listByCaptureStateAndStatus('inbox', 'active')));
  return collected;
}

function deps(storage: ReturnType<typeof createInMemoryStorage>, now = NOW) {
  return {
    storage,
    now,
    deviceId: DEVICE,
    ownerScope: OWNER,
    hasProEntitlement: false,
  };
}

describe('applyTodoistImport: годный файл', () => {
  let storage: ReturnType<typeof createInMemoryStorage>;

  beforeEach(() => {
    storage = createInMemoryStorage();
  });

  it('создаёт проект, разделы, метки и задачи и помечает их партией импорта', async () => {
    const plan = planFrom('todoist-single.csv', 'Работа.csv');
    const outcome = await applyTodoistImport(plan, deps(storage));

    expect(outcome.createdProjectIds).toHaveLength(1);
    expect(outcome.createdSectionIds).toHaveLength(2);
    expect(outcome.createdTaskIds).toHaveLength(5);
    expect(outcome.skipped).toEqual([]);

    const projectId = outcome.createdProjectIds[0] as Uuid;
    const project = await storage.projects.findById(projectId);
    expect(project?.title).toBe('Работа');

    const tasks = await allActiveTasks(storage);
    const parent = tasks.find((task) => task.title === 'Собрать отчёт');
    expect(parent?.projectId).toBe(projectId);
    expect(parent?.source).toBe('import');
    // `import_batch_id` из `01§26` — это `sourceCaptureBatchId`.
    expect(parent?.sourceCaptureBatchId).toBe(outcome.batchId);
    expect(parent?.plannedDate?.toString()).toBe('2026-09-10');
    expect(parent?.plannedTime?.toString()).toBe('14:00:00');
    expect(parent?.deadlineDate?.toString()).toBe('2026-09-12');
    expect(parent?.durationMin).toBe(45);
    expect(parent?.priority).toBe(1);
  });

  it('иерархия сохранена: подзадачи привязаны к своему родителю', async () => {
    const plan = planFrom('todoist-single.csv', 'Работа.csv');
    await applyTodoistImport(plan, deps(storage));

    const all = await allActiveTasks(storage);
    const parent = all.find((task) => task.title === 'Собрать отчёт');
    const child = all.find((task) => task.title === 'Выгрузить данные');
    const grandchild = all.find((task) => task.title === 'Проверить формулы');
    expect(child?.parentTaskId).toBe(parent?.id);
    // Сплющено до ПРЯМОЙ подзадачи верхнего предка (`01§26`).
    expect(grandchild?.parentTaskId).toBe(parent?.id);
  });

  it('метки созданы один раз на импорт и привязаны к задаче', async () => {
    const plan = planFrom('todoist-single.csv', 'Работа.csv');
    const outcome = await applyTodoistImport(plan, deps(storage));

    const labels = await storage.labels.listAll();
    expect(labels.map((label) => label.displayName)).toEqual(['работа']);

    const all = await allActiveTasks(storage);
    const parent = all.find((task) => task.title === 'Собрать отчёт');
    const links = await storage.taskLabels.listByTask(parent?.id as Uuid);
    expect(links).toHaveLength(1);
    expect(outcome.createdLabelIds).toHaveLength(1);
  });

  it('повторный импорт того же файла НЕ схлопывает дубликаты — заводит вторую копию', async () => {
    // Дедупликации в `01§26` нет ни слова, а молчаливое «уже есть» было бы
    // потерей данных при импорте двух похожих проектов. Поведение
    // зафиксировано тестом намеренно.
    const plan = planFrom('todoist-single.csv', 'Работа.csv');
    const first = await applyTodoistImport(plan, deps(storage));
    const second = await applyTodoistImport(plan, deps(storage));

    expect(second.batchId).not.toBe(first.batchId);
    const projects = await storage.projects.listActive();
    expect(projects).toHaveLength(2);
    const all = await allActiveTasks(storage);
    expect(all.filter((task) => task.title === 'Собрать отчёт')).toHaveLength(2);
  });

  it('импорт двенадцати проектов на Free не упирается в лимит 10 (01§26)', async () => {
    // «migration never discards data ... only later create/reactivate is gated».
    const files = Array.from({ length: 12 }, (_, index) => ({
      fileName: `Проект ${index + 1}.csv`,
      text: fixture('todoist-single.csv'),
    }));
    const { parseTodoistFiles } = await import('../src/index.js');
    const parsed = parseTodoistFiles(files);
    if (parsed.status !== 'ok') throw new Error('план не построился');

    const outcome = await applyTodoistImport(parsed.plan, deps(storage));

    expect(outcome.createdProjectIds).toHaveLength(12);
    expect(await storage.projects.listActive()).toHaveLength(12);
  });

  it('перелив комментариев сохранён целиком в отчёте партии, без усечения', async () => {
    const plan = planFrom('todoist-comments-overflow.csv', 'Большая.csv');
    const outcome = await applyTodoistImport(plan, deps(storage));

    const batch = await storage.importBatches.findById(outcome.batchId);
    const overflow = batch?.reportJson.overflowComments as { text: string }[];
    expect(overflow).toHaveLength(1);
    expect(overflow[0]?.text.length).toBeGreaterThan(100_000);
  });
});

describe('rollbackImport (01§26)', () => {
  let storage: ReturnType<typeof createInMemoryStorage>;

  beforeEach(() => {
    storage = createInMemoryStorage();
  });

  it('в течение 10 минут откат удаляет всё импортированное', async () => {
    const plan = planFrom('todoist-single.csv', 'Работа.csv');
    const outcome = await applyTodoistImport(plan, deps(storage));

    const withinWindow = NOW.add({ minutes: 5 });
    expect(
      (await canRollbackImport(outcome.batchId, { storage, now: withinWindow, deviceId: DEVICE }))
        .can,
    ).toBe(true);

    const result = await rollbackImport(outcome.batchId, {
      storage,
      now: withinWindow,
      deviceId: DEVICE,
    });

    expect(result.status).toBe('ok');
    expect(await storage.projects.listActive()).toEqual([]);
    expect(await allActiveTasks(storage)).toEqual([]);
    const batch = await storage.importBatches.findById(outcome.batchId);
    expect(batch?.status).toBe('rolled_back');
  });

  it('после 10 минут откат недоступен — и данные остаются на месте', async () => {
    const plan = planFrom('todoist-single.csv', 'Работа.csv');
    const outcome = await applyTodoistImport(plan, deps(storage));

    const tooLate = NOW.add({ minutes: 11 });
    const result = await rollbackImport(outcome.batchId, {
      storage,
      now: tooLate,
      deviceId: DEVICE,
    });

    expect(result).toEqual({ status: 'refused', code: 'window_expired' });
    expect(await storage.projects.listActive()).toHaveLength(1);
  });

  it('после первой ручной правки импортированного откат недоступен', async () => {
    const plan = planFrom('todoist-single.csv', 'Работа.csv');
    const outcome = await applyTodoistImport(plan, deps(storage));

    // Правка обычной командой домена — ровно то, что делает человек.
    const { updateTaskCommand } = await import('@shagi/core');
    const edited = outcome.createdTaskIds[0] as Uuid;
    const editResult = await updateTaskCommand(
      { id: edited, patch: { title: 'Изменено руками' } },
      { storage, now: NOW.add({ minutes: 1 }), deviceId: DEVICE },
    );
    expect(editResult.status).toBe('ok');

    const result = await rollbackImport(outcome.batchId, {
      storage,
      now: NOW.add({ minutes: 2 }),
      deviceId: DEVICE,
    });

    expect(result).toEqual({ status: 'refused', code: 'manually_edited' });
    // Ничего не удалено — «Rollback removes only untouched imported
    // entities», а тронутое есть, значит откат не начинается вовсе.
    expect(await storage.projects.listActive()).toHaveLength(1);
    expect((await allActiveTasks(storage)).length).toBeGreaterThan(0);
  });

  it('повторный откат той же партии отклоняется', async () => {
    const plan = planFrom('todoist-single.csv', 'Работа.csv');
    const outcome = await applyTodoistImport(plan, deps(storage));
    const at = NOW.add({ minutes: 1 });

    await rollbackImport(outcome.batchId, { storage, now: at, deviceId: DEVICE });
    const second = await rollbackImport(outcome.batchId, { storage, now: at, deviceId: DEVICE });

    expect(second).toEqual({ status: 'refused', code: 'already_rolled_back' });
  });

  it('откат несуществующей партии — честный отказ, а не исключение', async () => {
    const result = await rollbackImport(OWNER, { storage, now: NOW, deviceId: DEVICE });
    expect(result).toEqual({ status: 'refused', code: 'batch_not_found' });
  });
});
