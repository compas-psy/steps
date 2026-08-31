import { describe, expect, it } from 'vitest';

import { ALL_INDEXES, TASK_SEARCH_FTS_INDEX } from '../../src/schema/indexes.js';

/**
 * Списаны дословно из `02§3` (конспект §7) — расхождение с замороженным
 * контрактом обязано быть красным тестом, а не незамеченной опечаткой
 * (см. комментарий `../../src/schema/indexes.ts`).
 */
const EXPECTED_INDEXES: ReadonlyArray<{ table: string; columns: readonly string[] }> = [
  { table: 'tasks', columns: ['status', 'planned_date'] },
  { table: 'tasks', columns: ['status', 'deadline_date'] },
  { table: 'tasks', columns: ['capture_state', 'status'] },
  { table: 'tasks', columns: ['project_id', 'section_id', 'status', 'rank'] },
  { table: 'tasks', columns: ['parent_task_id', 'status', 'rank'] },
  { table: 'tasks', columns: ['focus_date', 'status'] },
  { table: 'tasks', columns: ['series_id', 'status'] },
  { table: 'sections', columns: ['project_id', 'rank'] },
  { table: 'task_labels', columns: ['task_id'] },
  { table: 'task_labels', columns: ['label_id'] },
];

describe('ALL_INDEXES — индексы конспекта §7 / 02§3', () => {
  it('совпадает буквально с замороженным списком, в том же порядке', () => {
    const actual = ALL_INDEXES.map(({ table, columns }) => ({ table, columns }));
    expect(actual).toEqual(EXPECTED_INDEXES);
  });

  it('имена индексов уникальны', () => {
    const names = ALL_INDEXES.map((index) => index.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('TASK_SEARCH_FTS_INDEX — FTS5 по заголовку/описанию (02§3)', () => {
  it('индексирует title и description задачи и денормализованные поля проекта/меток', () => {
    expect(TASK_SEARCH_FTS_INDEX.sourceTable).toBe('tasks');
    expect(TASK_SEARCH_FTS_INDEX.ownColumns).toEqual(['title', 'description']);
    expect(TASK_SEARCH_FTS_INDEX.denormalizedFields.length).toBeGreaterThan(0);
    expect(TASK_SEARCH_FTS_INDEX.rebuildableFromCanonicalRows).toBe(true);
  });
});
