import { describe, expect, it } from 'vitest';

import { createTaskCommand, type CreateTaskInput } from '../../src/commands/create-task.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { asUuid } from '../../src/values.js';
import { DEVICE_ID, NOW, OWNER_SCOPE, d } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

function baseInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
  return {
    ownerScope: OWNER_SCOPE,
    title: 'Купить молоко',
    captureState: 'inbox',
    source: 'user',
    rank: { placement: 'empty-list' },
    ...overrides,
  };
}

describe('createTaskCommand — успешный путь', () => {
  it('пишет и сущность, и outbox-запись через порт одной транзакцией', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createTaskCommand(baseInput(), deps(storage));

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(storage.allTasks()).toHaveLength(1);
    expect(storage.allTasks()[0]?.id).toBe(result.task.id);
    expect(storage.outboxEntries()).toHaveLength(1);
    expect(storage.outboxEntries()[0]?.entityId).toBe(result.task.id);
    expect(storage.outboxEntries()[0]?.entityType).toBe('task');
  });

  it('генерирует id (UUIDv7), op_id, rank, createdAt/updatedAt=now, revision=1, клоки на все поля', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createTaskCommand(baseInput(), deps(storage));
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.task.createdAt.equals(NOW)).toBe(true);
    expect(result.task.updatedAt.equals(NOW)).toBe(true);
    expect(result.task.revision).toBe(1n);
    expect(result.task.rank).toBeTruthy();

    const outbox = storage.outboxEntries()[0];
    expect(outbox?.opId).not.toBe(result.task.id);
    expect(outbox?.opId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(outbox?.baseRevision).toBe(0n);
    expect(outbox?.deviceId).toBe(DEVICE_ID);

    // title — одно из полей, реально заданных при создании — обязано иметь
    // свежий HLC с тем же physical=now и переданным deviceId.
    const titleClock = result.task.clocks['title'];
    expect(titleClock).toBeDefined();
    expect(titleClock?.physical.equals(NOW)).toBe(true);
    expect(titleClock?.deviceId).toBe(DEVICE_ID);
  });

  it('rank: empty-list даёт initialRank, end/start/between переиспользуют order/', async () => {
    const storage = new InMemoryCommandStoragePort();

    const first = await createTaskCommand(
      baseInput({ rank: { placement: 'empty-list' } }),
      deps(storage),
    );
    if (first.status !== 'ok') throw new Error('ожидался успех');

    const second = await createTaskCommand(
      baseInput({ title: 'Вторая', rank: { placement: 'end', lastRank: first.task.rank } }),
      deps(storage),
    );
    if (second.status !== 'ok') throw new Error('ожидался успех');
    expect(second.task.rank > first.task.rank).toBe(true);

    const third = await createTaskCommand(
      baseInput({
        title: 'Третья',
        rank: { placement: 'between', lowerRank: first.task.rank, upperRank: second.task.rank },
      }),
      deps(storage),
    );
    if (third.status !== 'ok') throw new Error('ожидался успех');
    expect(third.task.rank > first.task.rank).toBe(true);
    expect(third.task.rank < second.task.rank).toBe(true);
  });

  it('генераторы id/op_id детерминированы через deps (тестовая подстановка)', async () => {
    const storage = new InMemoryCommandStoragePort();
    const fixedId = asUuid('00000000-0000-0000-0000-000000000042');
    const fixedOpId = asUuid('00000000-0000-0000-0000-000000000099');

    const result = await createTaskCommand(
      baseInput(),
      deps(storage, { generateId: () => fixedId, generateOpId: () => fixedOpId }),
    );
    if (result.status !== 'ok') throw new Error('ожидался успех');

    expect(result.task.id).toBe(fixedId);
    expect(storage.outboxEntries()[0]?.opId).toBe(fixedOpId);
  });
});

describe('createTaskCommand — путь отклонения на блокирующем нарушении', () => {
  it('title пустой после нормализации — отклоняется, порт остаётся пустым', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createTaskCommand(baseInput({ title: '   ' }), deps(storage));

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues.some((issue) => issue.rule === 14)).toBe(true);
    expect(storage.isEmpty()).toBe(true);
  });

  it('sectionId без projectId — отклоняется (правило 5), порт остаётся пустым', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createTaskCommand(
      baseInput({ sectionId: asUuid('00000000-0000-0000-0000-000000000005') }),
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((issue) => issue.rule === 5)).toBe(true);
    expect(storage.isEmpty()).toBe(true);
  });

  it('plannedDate < availableFrom — отклоняется (правило 3), порт остаётся пустым', async () => {
    const storage = new InMemoryCommandStoragePort();

    const result = await createTaskCommand(
      baseInput({ availableFrom: d('2026-09-10'), plannedDate: d('2026-09-01') }),
      deps(storage),
    );

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.validation.issues.some((issue) => issue.rule === 3)).toBe(true);
    expect(storage.isEmpty()).toBe(true);
  });

  it('не бросает исключение при блокирующем нарушении', async () => {
    const storage = new InMemoryCommandStoragePort();

    await expect(createTaskCommand(baseInput({ title: '' }), deps(storage))).resolves.toMatchObject(
      {
        status: 'rejected',
      },
    );
  });
});
