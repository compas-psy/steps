import { describe, expect, it } from 'vitest';

import { BASELINE_SCHEMA_PLAN } from '../../src/migration/baseline-schema-plan.js';
import { ALL_INDEXES } from '../../src/schema/indexes.js';
import { ALL_TABLES } from '../../src/schema/tables.js';

describe('BASELINE_SCHEMA_PLAN — содержимое миграции 0001', () => {
  it('покрывает все 13 таблиц, все индексы и ровно один FTS5-индекс, в этом порядке', () => {
    const tableOps = BASELINE_SCHEMA_PLAN.filter((op) => op.op === 'create_table');
    const indexOps = BASELINE_SCHEMA_PLAN.filter((op) => op.op === 'create_index');
    const ftsOps = BASELINE_SCHEMA_PLAN.filter((op) => op.op === 'create_fts_index');

    expect(tableOps).toHaveLength(ALL_TABLES.length);
    expect(indexOps).toHaveLength(ALL_INDEXES.length);
    expect(ftsOps).toHaveLength(1);
    expect(BASELINE_SCHEMA_PLAN).toHaveLength(ALL_TABLES.length + ALL_INDEXES.length + 1);
  });

  it('таблицы идут раньше индексов, индексы раньше FTS — индекс не может ссылаться на несуществующую таблицу', () => {
    const opKinds = BASELINE_SCHEMA_PLAN.map((op) => op.op);
    const lastTableIndex = opKinds.lastIndexOf('create_table');
    const firstIndexIndex = opKinds.indexOf('create_index');
    const ftsIndex = opKinds.indexOf('create_fts_index');

    expect(lastTableIndex).toBeLessThan(firstIndexIndex);
    expect(opKinds.lastIndexOf('create_index')).toBeLessThan(ftsIndex);
    expect(ftsIndex).toBe(opKinds.length - 1);
  });
});
