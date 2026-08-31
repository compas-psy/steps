import { describe, expect, it } from 'vitest';

import { ALL_TABLES } from '../../src/schema/tables.js';

const EXPECTED_TABLE_NAMES = [
  'tasks',
  'projects',
  'sections',
  'labels',
  'task_labels',
  'checklist_items',
  'reminders',
  'recurrence_series',
  'attachments',
  'task_links',
  'import_batches',
  'sync_outbox',
  'sync_conflicts',
];

describe('ALL_TABLES — тринадцать таблиц конспекта §7', () => {
  it('содержит ровно ожидаемые тринадцать таблиц, без дублей', () => {
    const names = ALL_TABLES.map((table) => table.name);
    expect(names).toEqual(EXPECTED_TABLE_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });

  it('у каждой таблицы непустой первичный ключ, и каждая колонка первичного ключа реально объявлена', () => {
    for (const table of ALL_TABLES) {
      expect(table.primaryKey.length, `${table.name}: пустой primaryKey`).toBeGreaterThan(0);
      const columnNames = new Set(table.columns.map((column) => column.name));
      for (const pkColumn of table.primaryKey) {
        expect(
          columnNames.has(pkColumn),
          `${table.name}: PK-колонка ${pkColumn} не объявлена`,
        ).toBe(true);
      }
    }
  });

  it('каждый внешний ключ ссылается на существующую таблицу и её реально объявленную колонку', () => {
    const tablesByName = new Map(ALL_TABLES.map((table) => [table.name, table]));
    for (const table of ALL_TABLES) {
      for (const fk of table.foreignKeys) {
        const target = tablesByName.get(fk.referencesTable);
        expect(
          target,
          `${table.name}.${fk.column} ссылается на несуществующую таблицу ${fk.referencesTable}`,
        ).toBeDefined();
        const targetColumnNames = new Set(target?.columns.map((column) => column.name));
        expect(
          targetColumnNames.has(fk.referencesColumn),
          `${table.name}.${fk.column} ссылается на несуществующую колонку ${fk.referencesTable}.${fk.referencesColumn}`,
        ).toBe(true);
      }
    }
  });

  it('ни у одной таблицы нет дублирующихся имён колонок', () => {
    for (const table of ALL_TABLES) {
      const names = table.columns.map((column) => column.name);
      expect(new Set(names).size, `${table.name}: дублирующиеся колонки`).toBe(names.length);
    }
  });
});
