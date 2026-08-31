import { describe, expect, it } from 'vitest';

import {
  makeHlc,
  makeLabel,
  makeOutboxEntry,
  makeProject,
  makeTask,
  makeTaskLabel,
  nextInstant,
} from '../../src/contract/fixtures.js';
import {
  createIndexedDbStorage,
  openIndexedDbDatabase,
  rebuildSearchIndex,
  runSearch,
} from '../../src/indexeddb/index.js';
import { storeAccessFor } from '../../src/indexeddb/store-access.js';

import { createTestIndexedDbStorage } from './support/create-test-storage.js';

function waitForTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error ?? new Error('транзакция упала')));
  });
}

/**
 * Прямые тесты поисковой подсистемы IndexedDB-адаптера (`../../src/indexeddb/search-index.ts`,
 * задание пакета работ E02.3, п.2) — то, что golden-тесты (`golden/ranking.test.ts`)
 * не покрывают, потому что грузят датасет одной неизменной пачкой: каскадное
 * обновление денормализации при переименовании/tombstone проекта/метки и
 * восстановление индекса из канонических строк ("rebuildable from canonical
 * rows", `02§3`).
 */
describe('search-index — каскадные обновления денормализации', () => {
  it('переименование проекта видно в поиске по задаче через новое имя, не через старое', async () => {
    const storage = createTestIndexedDbStorage();
    const project = makeProject({ title: 'Ремонт' });
    const task = makeTask({ title: 'Позвонить мастеру', projectId: project.id });

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'project', value: project },
          { entity: 'task', value: task },
        ],
        outbox: [makeOutboxEntry('project', project.id), makeOutboxEntry('task', task.id)],
      });
    });

    await expect(storage.search('ремонт')).resolves.toEqual([
      { kind: 'project', id: project.id },
      { kind: 'task', id: task.id },
    ]);

    const renamedProject = { ...project, title: 'Стройка' };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'project', value: renamedProject }],
        outbox: [makeOutboxEntry('project', project.id)],
      });
    });

    await expect(storage.search('ремонт')).resolves.toEqual([]);
    await expect(storage.search('стройка')).resolves.toEqual([
      { kind: 'project', id: project.id },
      { kind: 'task', id: task.id },
    ]);
  });

  it('переименование метки видно в поиске по задаче через новое имя, не через старое', async () => {
    const storage = createTestIndexedDbStorage();
    const label = makeLabel({ displayName: 'Срочное' });
    const task = makeTask({ title: 'Написать отчёт' });
    const link = makeTaskLabel(task.id, label.id, makeHlc(nextInstant()));

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'label', value: label },
          { entity: 'task', value: task },
          { entity: 'task_label', value: link },
        ],
        outbox: [
          makeOutboxEntry('label', label.id),
          makeOutboxEntry('task', task.id),
          makeOutboxEntry('task_label', task.id),
        ],
      });
    });

    await expect(storage.search('срочное')).resolves.toEqual([
      { kind: 'label', id: label.id },
      { kind: 'task', id: task.id },
    ]);

    const renamedLabel = { ...label, displayName: 'Горит' };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'label', value: renamedLabel }],
        outbox: [makeOutboxEntry('label', label.id)],
      });
    });

    await expect(storage.search('срочное')).resolves.toEqual([]);
    await expect(storage.search('горит')).resolves.toEqual([
      { kind: 'label', id: label.id },
      { kind: 'task', id: task.id },
    ]);
  });

  it('снятие метки с задачи (OR-set removeHlc) убирает задачу из уровня 5 по этой метке', async () => {
    const storage = createTestIndexedDbStorage();
    const label = makeLabel({ displayName: 'Важное' });
    const task = makeTask({ title: 'Купить билеты' });
    const addHlc = makeHlc(nextInstant());
    const link = makeTaskLabel(task.id, label.id, addHlc);

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'label', value: label },
          { entity: 'task', value: task },
          { entity: 'task_label', value: link },
        ],
        outbox: [
          makeOutboxEntry('label', label.id),
          makeOutboxEntry('task', task.id),
          makeOutboxEntry('task_label', task.id),
        ],
      });
    });
    await expect(storage.search('важное')).resolves.toEqual([
      { kind: 'label', id: label.id },
      { kind: 'task', id: task.id },
    ]);

    const removeHlc = makeHlc(nextInstant());
    const removedLink = makeTaskLabel(task.id, label.id, addHlc, removeHlc);
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task_label', value: removedLink }],
        outbox: [makeOutboxEntry('task_label', task.id)],
      });
    });

    // метка сама по себе всё ещё находится — задача через неё уже нет.
    await expect(storage.search('важное')).resolves.toEqual([{ kind: 'label', id: label.id }]);
  });

  it('tombstone задачи убирает её из поиска целиком', async () => {
    const storage = createTestIndexedDbStorage();
    const task = makeTask({ title: 'Разовая задача' });

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });
    await expect(storage.search('разовая')).resolves.toEqual([{ kind: 'task', id: task.id }]);

    const tombstoned = { ...task, deletedAt: nextInstant() };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: tombstoned }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });
    await expect(storage.search('разовая')).resolves.toEqual([]);
  });

  it('tombstone проекта убирает и сам проект, и денормализованную ссылку на него у задачи', async () => {
    const storage = createTestIndexedDbStorage();
    const project = makeProject({ title: 'Переезд' });
    const task = makeTask({ title: 'Собрать коробки', projectId: project.id });

    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          { entity: 'project', value: project },
          { entity: 'task', value: task },
        ],
        outbox: [makeOutboxEntry('project', project.id), makeOutboxEntry('task', task.id)],
      });
    });
    await expect(storage.search('переезд')).resolves.toEqual([
      { kind: 'project', id: project.id },
      { kind: 'task', id: task.id },
    ]);

    const tombstonedProject = { ...project, deletedAt: nextInstant() };
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'project', value: tombstonedProject }],
        outbox: [makeOutboxEntry('project', project.id)],
      });
    });

    // ни проект (tombstone), ни задача через него (денормализация снята) —
    // задача сама по себе всё ещё живая и находимая по своему заголовку.
    await expect(storage.search('переезд')).resolves.toEqual([]);
    await expect(storage.search('коробки')).resolves.toEqual([{ kind: 'task', id: task.id }]);
  });
});

describe('rebuildSearchIndex — восстановление из канонических строк (02§3)', () => {
  it('пересобирает search_documents/search_index заново, даже если они были испорчены напрямую', async () => {
    const databaseName = `test-rebuild-${crypto.randomUUID()}`;
    const storage = createIndexedDbStorage(databaseName);

    const task = makeTask({ title: 'Отчёт по продажам' });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });
    await expect(storage.search('отчёт')).resolves.toEqual([{ kind: 'task', id: task.id }]);

    // Второе соединение к ТОЙ ЖЕ базе (fake-indexeddb хранит по имени) —
    // портим поисковые store напрямую, в обход обычного пути записи, имитируя
    // "индекс отстал от канонических строк" (например, после сбойной ручной
    // миграции данных или бага в прошлой версии индексатора).
    const db = await openIndexedDbDatabase(databaseName);
    const corruptTx = db.transaction(
      ['search_documents', 'search_index', 'search_index_by_entity'],
      'readwrite',
    );
    const corruptAccess = storeAccessFor(corruptTx);
    corruptAccess.store('search_documents').clear();
    corruptAccess.store('search_index').clear();
    corruptAccess.store('search_index_by_entity').clear();
    await waitForTransaction(corruptTx);

    await expect(storage.search('отчёт')).resolves.toEqual([]); // индекс и правда испорчен

    const rebuildTx = db.transaction(
      [
        'tasks',
        'projects',
        'labels',
        'task_labels',
        'search_documents',
        'search_index',
        'search_index_by_entity',
      ],
      'readwrite',
    );
    const rebuildAccess = storeAccessFor(rebuildTx);
    await rebuildSearchIndex(rebuildAccess);
    await waitForTransaction(rebuildTx);

    await expect(storage.search('отчёт')).resolves.toEqual([{ kind: 'task', id: task.id }]);

    // и напрямую через `runSearch` на том же соединении — убеждаемся, что
    // это действительно та же самая пересобранная структура, а не случайное
    // совпадение через кэш другого уровня.
    const readTx = db.transaction(['search_documents'], 'readonly');
    await expect(runSearch(storeAccessFor(readTx), 'отчёт')).resolves.toEqual([
      { kind: 'task', id: task.id },
    ]);
  });
});
