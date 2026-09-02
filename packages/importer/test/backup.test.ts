/**
 * Экспорт и восстановление бэкапа — сквозь НАСТОЯЩИЙ ZIP-файл (он
 * собирается, пишется на диск, читается обратно) и НАСТОЯЩЕЕ хранилище.
 * Ни одного мока: проверяется то, что реально доехало из базы в архив и
 * из архива обратно в базу.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Temporal } from '@js-temporal/polyfill';
import {
  asUuid,
  completeTaskCommand,
  createLabelCommand,
  createProjectCommand,
  createSectionCommand,
  createTaskCommand,
  createRecurringTaskCommand,
  attachLabelToTaskCommand,
  type Uuid,
} from '@shagi/core';
import { createInMemoryStorage } from '@shagi/storage';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyRestore,
  buildBackupArchive,
  NO_EXISTING_IDS,
  planRestore,
  readBackupArchive,
  unpackArchive,
  type WorkspaceSnapshot,
} from '../src/index.js';

const NOW = Temporal.Instant.from('2026-09-02T09:00:00Z');
const DEVICE = asUuid('01a06322-0000-7000-8000-000000000001');
const OWNER = asUuid('01a06322-0000-7000-8000-000000000002');

type Storage = ReturnType<typeof createInMemoryStorage>;

function cmd(storage: Storage, now = NOW) {
  return { storage, now, deviceId: DEVICE };
}

/** Полное рабочее пространство: проект с разделом, метка, родитель с
 * подзадачей, завершённая задача (история) и повторяющаяся серия. */
async function seedWorkspace(storage: Storage): Promise<void> {
  const project = await createProjectCommand(
    {
      title: 'Работа',
      colorToken: 'forest-800',
      defaultView: 'list',
      hasProEntitlement: false,
      rank: { placement: 'empty-list' },
    },
    cmd(storage),
  );
  if (project.status !== 'ok') throw new Error('проект не создан');
  const section = await createSectionCommand(
    { projectId: project.project.id, title: 'Планёрка', rank: { placement: 'empty-list' } },
    cmd(storage),
  );
  if (section.status !== 'ok') throw new Error('раздел не создан');
  const label = await createLabelCommand(
    { displayName: 'важное', colorToken: null, rank: { placement: 'empty-list' } },
    cmd(storage),
  );
  if (label.status !== 'ok') throw new Error('метка не создана');

  const parent = await createTaskCommand(
    {
      ownerScope: OWNER,
      title: 'Родитель',
      projectId: project.project.id,
      sectionId: section.section.id,
      captureState: 'processed',
      plannedDate: Temporal.PlainDate.from('2026-09-05'),
      source: 'user',
      rank: { placement: 'empty-list' },
    },
    cmd(storage),
  );
  if (parent.status !== 'ok') throw new Error('родитель не создан');

  const child = await createTaskCommand(
    {
      ownerScope: OWNER,
      title: 'Подзадача',
      projectId: project.project.id,
      sectionId: section.section.id,
      parentTaskId: parent.task.id,
      captureState: 'processed',
      source: 'user',
      rank: { placement: 'empty-list' },
    },
    cmd(storage),
  );
  if (child.status !== 'ok') throw new Error('подзадача не создана');

  await attachLabelToTaskCommand(
    { taskId: parent.task.id, labelId: label.label.id },
    { ...cmd(storage), taskStorage: storage },
  );

  const done = await createTaskCommand(
    {
      ownerScope: OWNER,
      title: 'Уже сделано',
      captureState: 'inbox',
      source: 'user',
      rank: { placement: 'empty-list' },
    },
    cmd(storage),
  );
  if (done.status !== 'ok') throw new Error('задача не создана');
  await completeTaskCommand({ id: done.task.id }, cmd(storage));

  const recurring = await createRecurringTaskCommand(
    {
      ownerScope: OWNER,
      title: 'Каждый день',
      captureState: 'processed',
      plannedDate: Temporal.PlainDate.from('2026-09-03'),
      source: 'user',
      rank: { placement: 'empty-list' },
      anchorType: 'scheduled',
      rule: { unit: 'day', interval: 1 },
    },
    cmd(storage),
  );
  if (recurring.status !== 'ok') throw new Error('серия не создана');
}

async function snapshotOf(storage: Storage): Promise<WorkspaceSnapshot> {
  const exported = await storage.exportAllEntities();
  return { ...exported, settings: { 'shagi.preferences.theme': 'dark' } };
}

describe('бэкап: экспорт → удаление → восстановление', () => {
  let storage: Storage;

  beforeEach(async () => {
    storage = createInMemoryStorage();
    await seedWorkspace(storage);
  });

  it('архив пишется на диск, читается обратно и восстанавливает граф целиком', async () => {
    const before = await snapshotOf(storage);
    const bytes = await buildBackupArchive(before, {
      appVersion: '0.1.0',
      exportedAt: NOW.toString(),
      locale: 'ru-RU',
    });

    // Настоящий файл на диске, а не буфер в памяти.
    const dir = mkdtempSync(join(tmpdir(), 'shagi-backup-'));
    const path = join(dir, 'shagi-backup-v1.zip');
    writeFileSync(path, bytes);
    const readBack = readFileSync(path);

    // Стирание всего — ровно то, что делает M52.
    await storage.eraseAllLocalData();
    expect((await storage.exportAllEntities()).tasks).toEqual([]);

    const parsed = await readBackupArchive(new Uint8Array(readBack));
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;

    const plan = planRestore(parsed.snapshot, { existing: NO_EXISTING_IDS });
    expect(plan.mode).toBe('preserve_ids');
    await applyRestore(plan.snapshot, cmd(storage));

    const after = await storage.exportAllEntities();
    // Идентификаторы сохранены (`01§27`, режим 1).
    expect(after.tasks.map((task) => task.id).toSorted()).toEqual(
      before.tasks.map((task) => task.id).toSorted(),
    );
    expect(after.projects.map((p) => p.id)).toEqual(before.projects.map((p) => p.id));
    expect(after.labels.map((l) => l.id)).toEqual(before.labels.map((l) => l.id));
  });

  it('иерархия, история завершения, метки, разделы и серия переживают круг', async () => {
    const before = await snapshotOf(storage);
    const bytes = await buildBackupArchive(before, {
      appVersion: '0.1.0',
      exportedAt: NOW.toString(),
      locale: 'ru-RU',
    });
    await storage.eraseAllLocalData();
    const parsed = await readBackupArchive(bytes);
    if (parsed.status !== 'ok') throw new Error('архив не прочитан');
    await applyRestore(
      planRestore(parsed.snapshot, { existing: NO_EXISTING_IDS }).snapshot,
      cmd(storage),
    );

    const after = await storage.exportAllEntities();
    const parent = after.tasks.find((task) => task.title === 'Родитель');
    const child = after.tasks.find((task) => task.title === 'Подзадача');
    expect(child?.parentTaskId).toBe(parent?.id);
    expect(child?.projectId).toBe(parent?.projectId);
    expect(child?.sectionId).toBe(parent?.sectionId);

    // История завершения — `completedAt`/`completionKind` восстановлены, а
    // не сброшены в «активна».
    const done = after.tasks.find((task) => task.title === 'Уже сделано');
    expect(done?.status).toBe('completed');
    expect(done?.completionKind).toBe('done');
    expect(done?.completedAt).not.toBeNull();

    // Дата плана — та же локальная дата, без сдвига поясом.
    expect(parent?.plannedDate?.toString()).toBe('2026-09-05');

    expect(after.sections.map((section) => section.title)).toEqual(['Планёрка']);
    expect(after.labels.map((label) => label.displayName)).toEqual(['важное']);
    expect(after.taskLabels).toHaveLength(1);
    expect(after.taskLabels[0]?.taskId).toBe(parent?.id);

    // Серия повторов и её ссылка с задачи.
    expect(after.recurrenceSeries).toHaveLength(1);
    const recurringTask = after.tasks.find((task) => task.title === 'Каждый день');
    expect(recurringTask?.seriesId).toBe(after.recurrenceSeries[0]?.id);
  });

  it('bigint и Temporal переживают JSON без потери типа', async () => {
    const before = await snapshotOf(storage);
    const bytes = await buildBackupArchive(before, {
      appVersion: '0.1.0',
      exportedAt: NOW.toString(),
      locale: 'ru-RU',
    });
    const parsed = await readBackupArchive(bytes);
    if (parsed.status !== 'ok') throw new Error('архив не прочитан');
    const task = parsed.snapshot.tasks.find((t) => t.title === 'Родитель');
    expect(typeof task?.revision).toBe('bigint');
    expect(task?.plannedDate).toBeInstanceOf(Temporal.PlainDate);
    expect(task?.createdAt).toBeInstanceOf(Temporal.Instant);
  });

  it('манифест содержит версию, локаль и контрольные суммы, но не секреты', async () => {
    const before = await snapshotOf(storage);
    const bytes = await buildBackupArchive(before, {
      appVersion: '0.1.0',
      exportedAt: NOW.toString(),
      locale: 'ru-RU',
    });
    const unpacked = unpackArchive(bytes);
    if (unpacked.status !== 'ok') throw new Error('архив не распаковался');
    const manifest = JSON.parse(new TextDecoder().decode(unpacked.files['manifest.json']));
    expect(manifest.schema_version).toBe(1);
    expect(manifest.locale).toBe('ru-RU');
    expect(Object.keys(manifest.checksums)).toContain('data/tasks.jsonl');
    // Очередь синхронизации и устройства в архив не попадают вовсе.
    expect(Object.keys(unpacked.files).some((path) => path.includes('outbox'))).toBe(false);
    expect(JSON.stringify(manifest)).not.toContain(DEVICE);
  });

  it('испорченный архив отвергается по контрольной сумме, а не восстанавливается наполовину', async () => {
    const before = await snapshotOf(storage);
    const bytes = await buildBackupArchive(before, {
      appVersion: '0.1.0',
      exportedAt: NOW.toString(),
      locale: 'ru-RU',
    });
    const unpacked = unpackArchive(bytes);
    if (unpacked.status !== 'ok') throw new Error('архив не распаковался');
    const { packArchive, encodeText } = await import('../src/index.js');
    const tampered = packArchive({
      ...unpacked.files,
      'data/tasks.jsonl': encodeText('{"подделка":true}'),
    });

    const parsed = await readBackupArchive(tampered);
    expect(parsed.status).toBe('rejected');
    if (parsed.status === 'rejected') {
      expect(parsed.code).toBe('checksum_mismatch');
      expect(parsed.path).toBe('data/tasks.jsonl');
    }
  });
});

describe('бэкап: восстановление в НЕпустое пространство (01§27, режим 2)', () => {
  it('столкнувшиеся id перенумерованы согласованно по всему графу, существующее не тронуто', async () => {
    const origin = createInMemoryStorage();
    await seedWorkspace(origin);
    const snapshot = { ...(await origin.exportAllEntities()), settings: {} };

    // Целевое пространство уже содержит РОВНО ТЕ ЖЕ id (самый жёсткий
    // случай: восстановление поверх самого себя).
    const target = createInMemoryStorage();
    await applyRestore(snapshot, cmd(target));
    const existingBefore = await target.exportAllEntities();

    const existing = {
      projects: new Set(existingBefore.projects.map((p) => p.id)),
      sections: new Set(existingBefore.sections.map((s) => s.id)),
      tasks: new Set(existingBefore.tasks.map((t) => t.id)),
      labels: new Set(existingBefore.labels.map((l) => l.id)),
      checklistItems: new Set(existingBefore.checklistItems.map((c) => c.id)),
      reminders: new Set(existingBefore.reminders.map((r) => r.id)),
      recurrenceSeries: new Set(existingBefore.recurrenceSeries.map((r) => r.id)),
    };

    const plan = planRestore(snapshot, { existing });
    expect(plan.mode).toBe('remap_collisions');
    await applyRestore(plan.snapshot, cmd(target, NOW.add({ minutes: 1 })));

    const after = await target.exportAllEntities();
    // Ничего не перезаписано: задач стало вдвое больше.
    expect(after.tasks).toHaveLength(existingBefore.tasks.length * 2);
    expect(after.projects).toHaveLength(existingBefore.projects.length * 2);

    // Ссылки в перенумерованной копии ведут ВНУТРЬ неё, а не в чужой граф.
    const newParent = plan.snapshot.tasks.find((task) => task.title === 'Родитель');
    const newChild = plan.snapshot.tasks.find((task) => task.title === 'Подзадача');
    expect(newChild?.parentTaskId).toBe(newParent?.id);
    expect(newParent?.id).not.toBe(
      snapshot.tasks.find((task) => task.title === 'Родитель')?.id as Uuid,
    );
    const newProjectId = plan.snapshot.projects[0]?.id;
    expect(newParent?.projectId).toBe(newProjectId);
    expect(plan.snapshot.sections[0]?.projectId).toBe(newProjectId);
    expect(plan.snapshot.taskLabels[0]?.taskId).toBe(newParent?.id);
    expect(plan.snapshot.taskLabels[0]?.labelId).toBe(plan.snapshot.labels[0]?.id);
    const newRecurring = plan.snapshot.tasks.find((task) => task.title === 'Каждый день');
    expect(newRecurring?.seriesId).toBe(plan.snapshot.recurrenceSeries[0]?.id);
  });

  it('без столкновений id сохраняются даже в непустом пространстве', async () => {
    // «Colliding IDs are remapped» — только СТОЛКНУВШИЕСЯ, а не все.
    const origin = createInMemoryStorage();
    await seedWorkspace(origin);
    const snapshot = { ...(await origin.exportAllEntities()), settings: {} };

    const target = createInMemoryStorage();
    await seedWorkspace(target); // свои данные, другие id
    const existingBefore = await target.exportAllEntities();

    const plan = planRestore(snapshot, {
      existing: {
        projects: new Set(existingBefore.projects.map((p) => p.id)),
        sections: new Set(existingBefore.sections.map((s) => s.id)),
        tasks: new Set(existingBefore.tasks.map((t) => t.id)),
        labels: new Set(existingBefore.labels.map((l) => l.id)),
        checklistItems: new Set(),
        reminders: new Set(),
        recurrenceSeries: new Set(existingBefore.recurrenceSeries.map((r) => r.id)),
      },
    });

    expect(plan.mode).toBe('preserve_ids');
    expect(plan.remapped.size).toBe(0);
  });

  it('повторное восстановление того же архива НЕ схлопывает копии', async () => {
    // Дедупликации в `01§27` нет: «never overwrite silently» означает
    // именно «не перезаписывать», а не «пропустить».
    const origin = createInMemoryStorage();
    await seedWorkspace(origin);
    const snapshot = { ...(await origin.exportAllEntities()), settings: {} };

    const target = createInMemoryStorage();
    await applyRestore(snapshot, cmd(target));
    const first = await target.exportAllEntities();

    const existing = {
      projects: new Set(first.projects.map((p) => p.id)),
      sections: new Set(first.sections.map((s) => s.id)),
      tasks: new Set(first.tasks.map((t) => t.id)),
      labels: new Set(first.labels.map((l) => l.id)),
      checklistItems: new Set(first.checklistItems.map((c) => c.id)),
      reminders: new Set(first.reminders.map((r) => r.id)),
      recurrenceSeries: new Set(first.recurrenceSeries.map((r) => r.id)),
    };
    const plan = planRestore(snapshot, { existing });
    await applyRestore(plan.snapshot, cmd(target, NOW.add({ minutes: 1 })));

    const second = await target.exportAllEntities();
    expect(second.tasks).toHaveLength(first.tasks.length * 2);
  });
});
