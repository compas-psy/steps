import { Temporal } from '@js-temporal/polyfill';
import {
  attachLabelToTaskCommand,
  asUuid,
  createLabelCommand,
  createRecurringTaskCommand,
} from '@shagi/core';
import { describe, expect, it } from 'vitest';

import { openNativeSqliteStorage } from '../../src/sqlite/sqlite-storage.js';
import { createFakeNativeBridge } from './support/fake-native-bridge.js';

/**
 * Регресс на Android-дефект из эмулятор-смоука: реальный прогон Quick Add
 * с чипом повтора и меткой («Полить цветы каждый день @дом») завершался
 * `Не удалось создать задачу. Попробуйте ещё раз.` — UI глотал причину, но
 * после smoke-фикса (READ_TASK_ROW_TITLES вместо предпросмотра формы) стало
 * видно, что это НЕ ложный таймаут теста, а настоящий сбой команды.
 *
 * Этот тест прогоняет РОВНО ТУ ЖЕ последовательность вызовов, что
 * `QuickAdd.handleSubmit` (`packages/app/src/screens/QuickAdd.tsx`):
 * find-or-create метки → `createRecurringTaskCommand` → `attachLabelToTaskCommand`
 * — против настоящего SQLite (мост в форме `native-bridge.ts`, транспорт —
 * `node:sqlite` через `JSON.parse(JSON.stringify(...))` на каждой границе,
 * тот же приём, что `native-bridge-contract.test.ts`). Не покрывает
 * `classify_statement` (он существует только в Rust, `apps/mobile/src-tauri/
 * src/sqlite.rs`) — если этот тест зелёный, а Android всё равно падает,
 * дефект специфичен для нативного моста/гейта, а не для доменных команд.
 */
const OWNER_SCOPE = asUuid('00000000-0000-0000-0000-0000000000f0');
const DEVICE_ID = asUuid('00000000-0000-0000-0000-0000000000d1');
const NOW = Temporal.Instant.from('2026-09-02T09:00:00Z');

describe('Quick Add: повтор + метка через native SQLite (регресс)', () => {
  it('find-or-create метки → createRecurringTaskCommand → attachLabelToTaskCommand — всё «ok»', async () => {
    const storage = await openNativeSqliteStorage(
      createFakeNativeBridge({ relaxForeignKeysAfterOpen: true }),
      'quick-add-recurring-label.db',
    );
    const deps = { storage, now: NOW, deviceId: DEVICE_ID };

    // --- 1. find-or-create метки «дом» (ровно как QuickAdd.tsx) -----------
    const found = await storage.labels.findByNormalizedName('дом');
    expect(found).toBeNull();
    const createdLabel = await createLabelCommand(
      { displayName: 'дом', colorToken: null, rank: { placement: 'empty-list' } },
      deps,
    );
    expect(createdLabel.status).toBe('ok');
    if (createdLabel.status !== 'ok') return;

    // --- 2. createRecurringTaskCommand (Полить цветы, каждый день) --------
    const created = await createRecurringTaskCommand(
      {
        ownerScope: OWNER_SCOPE,
        title: 'Полить цветы',
        captureState: 'processed',
        source: 'user',
        sourceChannel: 'text',
        rank: { placement: 'empty-list' },
        anchorType: 'scheduled',
        rule: { unit: 'day', interval: 1 },
      },
      deps,
    );
    expect(created.status).toBe('ok');
    if (created.status !== 'ok') return;

    // --- 3. attachLabelToTaskCommand ---------------------------------------
    const attached = await attachLabelToTaskCommand(
      { taskId: created.task.id, labelId: createdLabel.label.id },
      { storage, taskStorage: storage, now: NOW, deviceId: DEVICE_ID },
    );
    expect(attached.status).toBe('ok');

    // --- Инварианты после полной цепочки -----------------------------------
    const persistedTask = await storage.tasks.findById(created.task.id);
    expect(persistedTask).not.toBeNull();
    expect(persistedTask?.seriesId).toBe(created.series.id);

    const links = await storage.taskLabels.listByTask(created.task.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.labelId).toBe(createdLabel.label.id);
  });
});
