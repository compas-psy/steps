import { Temporal } from '@js-temporal/polyfill';
import {
  asUuid,
  attachLabelToTaskCommand,
  createChecklistItemCommand,
  createExplicitReminderCommand,
  createLabelCommand,
  createProjectCommand,
  createRecurringTaskCommand,
  createSectionCommand,
  createTaskCommand,
  deleteTaskCommand,
  generateUuidV7,
} from '@shagi/core';
import { describe, expect, it } from 'vitest';

import { makeOutboxEntry } from '../../src/contract/fixtures.js';
import { ALL_TABLES } from '../../src/schema/tables.js';
import type { SqliteDriverPort } from '../../src/sqlite/driver-port.js';
import { openNativeSqliteStorage } from '../../src/sqlite/sqlite-storage.js';
import { createFakeNativeBridge } from './support/fake-native-bridge.js';

/**
 * `StoragePort` намеренно не выставляет наружу сырой SQL-драйвер
 * (инкапсуляция — вызывающий код `@shagi/app` не должен знать про SQLite).
 * Этому тесту нужны две вещи, которых нет в публичном порте: `COUNT(*)` по
 * произвольной таблице и `PRAGMA foreign_key_check` — обе диагностические,
 * не продуктовые. Читаем приватное поле `driver` через `unknown`-каст, а не
 * заново собираем протокол миграций (`openNativeSqliteStorage` делает это
 * внутри) ради второй независимой ручки на тот же драйвер.
 */
function peekDriver(
  storage: Awaited<ReturnType<typeof openNativeSqliteStorage>>,
): SqliteDriverPort {
  return (storage as unknown as { driver: SqliteDriverPort }).driver;
}

/**
 * M52-регресс, найденный Android-смоуком: `eraseAllLocalData()` падала
 * `FOREIGN KEY constraint failed` на `DELETE FROM "tasks"`, потому что
 * `task_labels`/`checklist_items`/... всё ещё ссылались на удаляемые
 * строки. Разбор причины и фикс — `../../src/schema/erase-order.ts` +
 * `../../src/sqlite/storage.ts` `eraseAllLocalData`.
 *
 * Этот тест засевает ПО ОДНОЙ строке в КАЖДУЮ таблицу с FK-зависимостью
 * (`../../src/schema/tables.ts`), включая self-referencing иерархию
 * `tasks.parent_task_id` и tombstone, затем вызывает `eraseAllLocalData()`
 * и проверяет, что она (а) не бросает, (б) оставляет каждую таблицу из
 * `ALL_TABLES` пустой, (в) `PRAGMA foreign_key_check` не находит ни одной
 * повисшей ссылки, (г) FTS5-индекс пуст, (д) база остаётся рабочей —
 * принимает новую задачу БЕЗ переоткрытия соединения.
 */
describe('eraseAllLocalData: полный FK-граф (регресс M52)', () => {
  it('стирает project/section/hierarchy/tombstone/recurring/label/reminder/checklist/link/outbox одной транзакцией', async () => {
    // Внешние ключи ОСТАЮТСЯ включёнными (не relaxForeignKeysAfterOpen) —
    // это ровно то, что этот тест обязан проверить: без правильного
    // порядка удаления `DELETE FROM "tasks"` падает `FOREIGN KEY
    // constraint failed` при включённых FK (`00§2`, обязательны в проде).
    // С ослабленными FK тест не поймал бы исходный дефект вообще.
    const storage = await openNativeSqliteStorage(createFakeNativeBridge(), 'erase-all.db');
    const ownerScope = asUuid('00000000-0000-0000-0000-0000000000f0');
    const deviceId = asUuid('00000000-0000-0000-0000-0000000000d1');
    const now = Temporal.Instant.from('2026-09-03T09:00:00Z');
    const nowLocal = Temporal.PlainDateTime.from('2026-09-03T09:00:00');
    const deps = { storage, now, deviceId };

    // --- project + section (sections.project_id → projects) --------------
    const project = await createProjectCommand(
      {
        title: 'Проект',
        colorToken: 'accent.default',
        defaultView: 'list',
        hasProEntitlement: false,
        rank: { placement: 'empty-list' },
      },
      deps,
    );
    expect(project.status).toBe('ok');
    if (project.status !== 'ok') return;

    const section = await createSectionCommand(
      { projectId: project.project.id, title: 'Секция', rank: { placement: 'empty-list' } },
      deps,
    );
    expect(section.status).toBe('ok');
    if (section.status !== 'ok') return;

    // --- parent + child (self-FK tasks.parent_task_id) + tombstone -------
    const parent = await createTaskCommand(
      {
        ownerScope,
        title: 'Родительская задача',
        captureState: 'processed',
        source: 'user',
        projectId: project.project.id,
        sectionId: section.section.id,
        rank: { placement: 'empty-list' },
      },
      deps,
    );
    expect(parent.status).toBe('ok');
    if (parent.status !== 'ok') return;

    const child = await createTaskCommand(
      {
        ownerScope,
        title: 'Дочерняя задача',
        captureState: 'processed',
        source: 'user',
        parentTaskId: parent.task.id,
        // Правило 6 (TASK_HIERARCHY_PROJECT_MISMATCH): подзадача обязана
        // унаследовать project/section родителя буквально.
        projectId: project.project.id,
        sectionId: section.section.id,
        rank: { placement: 'empty-list' },
      },
      deps,
    );
    expect(child.status).toBe('ok');
    if (child.status !== 'ok') return;

    const tombstoned = await deleteTaskCommand({ id: child.task.id }, deps);
    expect(tombstoned.status).toBe('ok');

    // --- recurring task + recurrence_series (tasks.series_id) ------------
    const recurring = await createRecurringTaskCommand(
      {
        ownerScope,
        title: 'Повторяющаяся задача',
        captureState: 'processed',
        source: 'user',
        rank: { placement: 'empty-list' },
        anchorType: 'scheduled',
        rule: { unit: 'day', interval: 1 },
      },
      deps,
    );
    expect(recurring.status).toBe('ok');
    if (recurring.status !== 'ok') return;

    // --- label + task_labels (task_id → tasks, label_id → labels) --------
    const label = await createLabelCommand(
      { displayName: 'метка', colorToken: null, rank: { placement: 'empty-list' } },
      deps,
    );
    expect(label.status).toBe('ok');
    if (label.status !== 'ok') return;

    const attached = await attachLabelToTaskCommand(
      { taskId: parent.task.id, labelId: label.label.id },
      { storage, taskStorage: storage, now, deviceId },
    );
    expect(attached.status).toBe('ok');

    // --- reminder (task_id → tasks) ---------------------------------------
    const reminder = await createExplicitReminderCommand(
      {
        taskId: parent.task.id,
        date: Temporal.PlainDate.from('2026-09-04'),
        time: null,
        deadlineDate: null,
        deadlineTime: null,
      },
      { storage, now, nowLocal, deviceId },
    );
    expect(reminder.status).toBe('ok');

    // --- checklist item (task_id → tasks) --------------------------------
    const checklistItem = await createChecklistItemCommand(
      { taskId: parent.task.id, text: 'пункт', rank: { placement: 'empty-list' } },
      deps,
    );
    expect(checklistItem.status).toBe('ok');

    // --- task_link (task_id → tasks) — нет отдельной команды, пишем ------
    // напрямую через applyMutation, как это делает сам storage-слой.
    const linkId = generateUuidV7();
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [
          {
            entity: 'task_link',
            value: {
              id: linkId,
              taskId: parent.task.id,
              url: 'https://example.com',
              displayLabel: null,
              createdAt: now,
              updatedAt: now,
            },
          },
        ],
        outbox: [makeOutboxEntry('task_link', linkId, { deviceId })],
      });
    });

    // --- import_batch (нет FK, но входит в ALL_TABLES) --------------------
    await storage.runTransaction(async (tx) => {
      await tx.saveImportBatch({
        id: generateUuidV7(),
        source: 'todoist',
        startedAt: now,
        finishedAt: now,
        rollbackDeadline: now.add({ hours: 1 }),
        status: 'completed',
        reportJson: {},
      });
    });

    // --- Убедиться, что данные реально легли, до стирания -----------------
    const beforeCounts = await countAllTables(storage);
    expect(beforeCounts.tasks).toBeGreaterThan(0);
    expect(beforeCounts.task_labels).toBeGreaterThan(0);
    expect(beforeCounts.checklist_items).toBeGreaterThan(0);
    expect(beforeCounts.reminders).toBeGreaterThan(0);
    expect(beforeCounts.task_links).toBeGreaterThan(0);
    expect(beforeCounts.recurrence_series).toBeGreaterThan(0);
    expect(beforeCounts.import_batches).toBeGreaterThan(0);
    expect(beforeCounts.sync_outbox).toBeGreaterThan(0);

    // --- Стирание -----------------------------------------------------------
    await expect(storage.eraseAllLocalData()).resolves.toBeUndefined();

    // --- Каждая таблица ALL_TABLES пуста ------------------------------------
    const afterCounts = await countAllTables(storage);
    for (const table of ALL_TABLES) {
      expect(afterCounts[table.name], `${table.name} обязана быть пустой после erase`).toBe(0);
    }

    // --- FTS5 пуст (виртуальная таблица, не в ALL_TABLES — своя проверка) ----
    const ftsRow = await peekDriver(storage).queryOne<{ n: number | bigint }>(
      'SELECT COUNT(*) AS n FROM "tasks_fts"',
    );
    expect(Number(ftsRow?.n ?? -1)).toBe(0);

    // --- Внешние ключи целы: PRAGMA foreign_key_check пуст --------------------
    // `sqlite_query` (Android) блокирует PRAGMA целиком (security review
    // ADR-0005, P1) — это НАМЕРЕННО не обходится здесь новым продуктовым
    // каналом. Проверяем инвариант тем же способом, каким его проверял бы
    // разработчик локально: напрямую на драйвере теста (`peekDriver`), в
    // обход продуктового IPC-гейта, который для этого и не предназначен.
    const violations = await peekDriver(storage).queryAll('PRAGMA foreign_key_check');
    expect(
      violations,
      `foreign_key_check обязан быть пуст: ${JSON.stringify(violations)}`,
    ).toHaveLength(0);

    // --- База пригодна для новой записи БЕЗ переоткрытия соединения -------
    const freshTask = await createTaskCommand(
      {
        ownerScope,
        title: 'Задача после стирания',
        captureState: 'processed',
        source: 'user',
        rank: { placement: 'empty-list' },
      },
      deps,
    );
    expect(freshTask.status).toBe('ok');
    if (freshTask.status !== 'ok') return;

    const persisted = await storage.tasks.findById(freshTask.task.id);
    expect(persisted?.title).toBe('Задача после стирания');
  });
});

async function countAllTables(
  storage: Awaited<ReturnType<typeof openNativeSqliteStorage>>,
): Promise<Record<string, number>> {
  const driver = peekDriver(storage);
  const counts: Record<string, number> = {};
  for (const table of ALL_TABLES) {
    const row = await driver.queryOne<{ n: number | bigint }>(
      `SELECT COUNT(*) AS n FROM "${table.name}"`,
    );
    counts[table.name] = Number(row?.n ?? 0);
  }
  return counts;
}
