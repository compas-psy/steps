import { describe, expect, it } from 'vitest';

import {
  completeOccurrenceCommand,
  skipOccurrenceCommand,
} from '../../src/commands/complete-occurrence.js';
import { deleteSeriesCommand } from '../../src/commands/delete-series.js';
import { undoCompleteOccurrenceCommand } from '../../src/commands/undo-complete-occurrence.js';
import type { TaskCommandDeps } from '../../src/commands/types.js';
import { updateTaskCommand } from '../../src/commands/update-task.js';
import type { RecurrenceSeries } from '../../src/entities/recurrence-series.js';
import { deriveOccurrenceId } from '../../src/identity/index.js';
import { makeOccurrenceSeq } from '../../src/values.js';
import { DEVICE_ID, NOW, d, existingTask, t, uuid } from './fixtures.js';
import { InMemoryCommandStoragePort } from './in-memory-storage-port.js';

function deps(
  storage: InMemoryCommandStoragePort,
  overrides: Partial<TaskCommandDeps> = {},
): TaskCommandDeps {
  return { storage, now: NOW, deviceId: DEVICE_ID, ...overrides };
}

const SERIES_ID = uuid('5e51e5000009');

function dailySeries(overrides: Partial<RecurrenceSeries> = {}): RecurrenceSeries {
  const base: RecurrenceSeries = {
    id: SERIES_ID,
    anchorType: 'scheduled',
    rrule: JSON.stringify({ unit: 'day', interval: 1 }),
    completionIntervalJson: null,
    templateJson: { unit: 'day', interval: 1 },
    active: true,
    nextOccurrenceSeq: makeOccurrenceSeq(2n),
    stopAfterOccurrenceSeq: null,
    templateRevision: 1n,
    createdAt: NOW.subtract({ hours: 2 }),
    updatedAt: NOW.subtract({ hours: 2 }),
    clocks: {},
  };
  return { ...base, ...overrides } as RecurrenceSeries;
}

function occurrence(seq: bigint) {
  return existingTask({
    id: deriveOccurrenceId(SERIES_ID, makeOccurrenceSeq(seq)),
    seriesId: SERIES_ID,
    occurrenceSeq: seq,
    plannedDate: d('2026-08-31'),
    plannedTime: t('09:00'),
  });
}

/**
 * Undo повторов (ST §58 U3, `01§11.5`/`01§11.8`/`01§11.9`). Файл покрывает
 * ровно четыре обязательных рубежа мандата: 6 — нетронутый next снимается
 * откатом; 7 — независимо изменённый next сохраняется и даёт конфликт;
 * 8 — «Пропустить это повторение» откатывается так же, как завершение;
 * 9 — граница удалённой серии не даёт устаревшему offline-завершению
 * воскресить будущий occurrence.
 */
describe('Undo повторов (ST §58 U3)', () => {
  it('6: завершение → undo снимает нетронутый next occurrence ОДНОЙ транзакцией', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = occurrence(1n);
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailySeries());

    const completed = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (completed.status !== 'ok' || completed.generatedTask === null) {
      throw new Error('ожидался успех с сгенерированным occurrence');
    }

    const before = storage.transactionCount;
    const undone = await undoCompleteOccurrenceCommand(
      { occurrenceId: current.id, generatedOccurrenceId: completed.generatedTask.id },
      deps(storage),
    );
    expect(undone.status).toBe('ok');
    if (undone.status !== 'ok') return;
    expect(undone.generatedOutcome).toBe('removed');
    // Откат текущего, tombstone next и откат границы серии — одна мутация.
    // Иначе между транзакциями существуют ДВА активных occurrence одной
    // серии, прямо запрещённые `01§11.10`.
    expect(storage.transactionCount - before).toBe(1);

    expect(undone.task.status).toBe('active');
    const generated = storage.allTasks().find((task) => task.id === completed.generatedTask?.id);
    expect(generated?.deletedAt).not.toBeNull();
    expect(undone.series?.nextOccurrenceSeq).toBe(2n);
  });

  it('7: независимо изменённый next сохраняется, исход — preserved_conflict', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = occurrence(1n);
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailySeries());

    const completed = await completeOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (completed.status !== 'ok' || completed.generatedTask === null) {
      throw new Error('ожидался успех с сгенерированным occurrence');
    }
    const generatedId = completed.generatedTask.id;

    // Чужая правка next occurrence — в `01§11.9` это работа другого
    // устройства; локально она отличается тем же признаком (`revision`
    // сдвинулся с 1n), поэтому проверяется тем же путём.
    const edited = await updateTaskCommand(
      { id: generatedId, patch: { title: 'Изменено на другом устройстве' } },
      deps(storage),
    );
    expect(edited.status).toBe('ok');

    const undone = await undoCompleteOccurrenceCommand(
      { occurrenceId: current.id, generatedOccurrenceId: generatedId },
      deps(storage),
    );
    expect(undone.status).toBe('ok');
    if (undone.status !== 'ok') return;
    // Не `absent`: UI обязан различить «удалять было нечего» и «чужая
    // работа сохранена» — второе показывает уведомление о конфликте.
    expect(undone.generatedOutcome).toBe('preserved_conflict');
    expect(undone.removedGeneratedTask).toBe(false);

    const generated = storage.allTasks().find((task) => task.id === generatedId);
    expect(generated?.deletedAt).toBeNull();
    expect(generated?.title).toBe('Изменено на другом устройстве');
    // Граница серии НЕ откатывается: следующий occurrence уже живёт своей
    // жизнью, и повторная генерация того же id создала бы второй активный.
    expect(undone.series?.nextOccurrenceSeq).toBe(3n);
    // Текущий всё равно откатывается — данные не теряются ни с одной стороны.
    expect(undone.task.status).toBe('active');
  });

  it('8: «Пропустить это повторение» откатывается тем же Undo', async () => {
    const storage = new InMemoryCommandStoragePort();
    const current = occurrence(1n);
    storage.seedTask(current);
    storage.seedRecurrenceSeries(dailySeries());

    const skipped = await skipOccurrenceCommand(
      { id: current.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    if (skipped.status !== 'ok' || skipped.generatedTask === null) {
      throw new Error('ожидался успех с сгенерированным occurrence');
    }
    // `01§11.5`: пропуск — это `completed` с `completion_kind='skipped'`,
    // а не отдельный статус и не tombstone.
    expect(skipped.task.status).toBe('completed');
    expect(skipped.task.completionKind).toBe('skipped');

    const undone = await undoCompleteOccurrenceCommand(
      { occurrenceId: current.id, generatedOccurrenceId: skipped.generatedTask.id },
      deps(storage),
    );
    expect(undone.status).toBe('ok');
    if (undone.status !== 'ok') return;
    expect(undone.task.status).toBe('active');
    // `active` не несёт `completionKind` — откат не обязан помнить, чем
    // именно было завершение.
    expect(undone.task.completionKind).toBeNull();
    expect(undone.generatedOutcome).toBe('removed');
  });

  it('9: после удаления всей серии устаревшее offline-завершение не воскрешает будущий occurrence', async () => {
    const storage = new InMemoryCommandStoragePort();
    const first = occurrence(1n);
    const second = occurrence(2n);
    storage.seedTask(first);
    storage.seedTask(second);
    // Серия уже сгенерировала два occurrence; граница ляжет на второй.
    storage.seedRecurrenceSeries(dailySeries({ nextOccurrenceSeq: makeOccurrenceSeq(3n) }));

    const deleted = await deleteSeriesCommand({ currentOccurrenceId: second.id }, deps(storage));
    expect(deleted.status).toBe('ok');
    if (deleted.status !== 'ok') return;
    expect(deleted.series.stopAfterOccurrenceSeq).toBe(2n);

    // Устаревшая работа офлайн-устройства: завершение ПЕРВОГО occurrence,
    // выполненное до того, как оно узнало об удалении серии. `01§11.8`
    // remove-wins: граница — сравнение номеров, а не HLC-меток, поэтому
    // порядок прихода не может её обойти.
    const stale = await completeOccurrenceCommand(
      { id: first.id, occurrenceLocalDate: d('2026-08-31') },
      deps(storage),
    );
    expect(stale.status).toBe('ok');
    if (stale.status !== 'ok') return;
    expect(stale.generatedTask).toBeNull();

    // История сохраняется: завершённый occurrence остаётся завершённым.
    expect(stale.task.status).toBe('completed');
    const live = storage.allTasks().filter((task) => task.deletedAt === null);
    expect(live.filter((task) => task.status === 'active')).toHaveLength(0);
  });
});
