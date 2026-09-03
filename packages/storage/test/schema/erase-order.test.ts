import { describe, expect, it } from 'vitest';

import { computeEraseOrder } from '../../src/schema/erase-order.js';
import { ALL_TABLES } from '../../src/schema/tables.js';
import type { TableDefinition } from '../../src/schema/types.js';

/**
 * M52-дефект, найденный Android-смоуком: `eraseAllLocalData` удаляла
 * таблицы в порядке объявления `ALL_TABLES`, а не в порядке, безопасном
 * для FK-графа — `DELETE FROM "tasks"` уходил раньше `task_labels`/
 * `checklist_items`/..., и падал `FOREIGN KEY constraint failed`. Эти
 * тесты проверяют саму функцию заказа удаления НАПРЯМУЮ, без SQLite: если
 * порядок неверен, это чисто графовая ошибка и её незачем ловить только на
 * настоящей базе.
 */
describe('computeEraseOrder', () => {
  it('для каждого FK ребёнок (ссылающаяся таблица) идёт раньше родителя (referencesTable)', () => {
    const order = computeEraseOrder(ALL_TABLES);
    const position = new Map(order.map((table, index) => [table.name, index]));

    for (const table of ALL_TABLES) {
      for (const fk of table.foreignKeys) {
        if (fk.referencesTable === table.name) continue; // self-reference — вне этой проверки, см. eraseAllLocalData
        const childPos = position.get(table.name);
        const parentPos = position.get(fk.referencesTable);
        expect(childPos, `таблица ${table.name} обязана быть в порядке`).toBeDefined();
        expect(parentPos, `таблица ${fk.referencesTable} обязана быть в порядке`).toBeDefined();
        expect(
          childPos! < parentPos!,
          `${table.name} (FK → ${fk.referencesTable}) обязана удаляться РАНЬШЕ ${fk.referencesTable}, ` +
            `а стоит на позиции ${childPos} против ${parentPos}`,
        ).toBe(true);
      }
    }
  });

  it('содержит ровно те же таблицы, что ALL_TABLES — не теряет и не дублирует', () => {
    const order = computeEraseOrder(ALL_TABLES);
    expect(order.map((t) => t.name).toSorted()).toEqual(ALL_TABLES.map((t) => t.name).toSorted());
  });

  it('на выдуманном цикле из ДВУХ разных таблиц (не self-reference) порядок всё равно детерминирован', () => {
    // Не сценарий реальной схемы (там цикла между разными таблицами нет),
    // а проверка, что функция не зацикливается и не падает на входе,
    // который её собственный алгоритм (DFS с visited-множеством) обязан
    // пережить конечным результатом, даже на графе, который она не обязана
    // «уметь» — устойчивость реализации, а не бизнес-требование.
    const a: TableDefinition = {
      name: 'a',
      columns: [],
      primaryKey: ['id'],
      foreignKeys: [{ column: 'b_id', referencesTable: 'b', referencesColumn: 'id' }],
    };
    const b: TableDefinition = {
      name: 'b',
      columns: [],
      primaryKey: ['id'],
      foreignKeys: [{ column: 'a_id', referencesTable: 'a', referencesColumn: 'id' }],
    };
    const order = computeEraseOrder([a, b]);
    expect(order).toHaveLength(2);
    expect(new Set(order.map((t) => t.name))).toEqual(new Set(['a', 'b']));
  });
});
