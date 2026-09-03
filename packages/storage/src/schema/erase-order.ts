import type { TableDefinition } from './types.js';

/**
 * Порядок удаления: таблица с исходящей FK-ссылкой на другую таблицу этого
 * списка обязана быть удалена РАНЬШЕ той, на которую ссылается — иначе
 * `DELETE` от родителя первым падает `FOREIGN KEY constraint failed` (`00§2`
 * — внешние ключи обязаны быть включены, это не смягчаемая настройка).
 * Ровно так `eraseAllLocalData` (`sqlite/storage.ts`) падал на реальном
 * Android-эмуляторе: `DELETE FROM "tasks"` уходил раньше `task_labels`/
 * `checklist_items`/..., которые всё ещё ссылались на удаляемые строки.
 *
 * Вычисляется топологической сортировкой по `TableDefinition.foreignKeys`
 * (обратной: обычная топологическая сортировка даёт порядок "родитель
 * раньше ребёнка" — годится для `CREATE TABLE`; разворот даёт "ребёнок
 * раньше родителя" — то, что нужно `DELETE`), а НЕ вручную поддерживаемым
 * списком: список, который держат в голове, расходится со схемой ровно в
 * тот день, когда в неё добавляют новую таблицу или FK и забывают
 * обновить список. Здесь разойтись физически негде — `erase-order.test.ts`
 * прогоняет эту функцию через настоящие `ALL_TABLES` при каждом тесте.
 *
 * Self-referencing FK (таблица ссылается сама на себя, как `tasks.
 * parent_task_id`/`tasks.generated_from_occurrence_id`) игнорируется этой
 * функцией НАМЕРЕННО: топологический порядок между РАЗНЫМИ таблицами такое
 * ребро не решает в принципе — оно внутри одной и той же таблицы. Вызывающий
 * код обязан разорвать его отдельным шагом (`UPDATE ... SET fk_column =
 * NULL WHERE ...`) до того, как воспользуется этим порядком: обе
 * self-referencing колонки `tasks` nullable, `SET NULL` не нарушает
 * ограничение ни для одной строки, а после него ни одна строка `tasks` не
 * ссылается на другую — порядок построчного удаления внутри одного
 * `DELETE FROM "tasks"` перестаёт быть значим.
 */
export function computeEraseOrder(tables: readonly TableDefinition[]): readonly TableDefinition[] {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const visited = new Set<string>();
  const creationOrder: TableDefinition[] = [];

  function visit(table: TableDefinition): void {
    if (visited.has(table.name)) return;
    visited.add(table.name);
    for (const fk of table.foreignKeys) {
      if (fk.referencesTable === table.name) continue; // self-reference — разрывается отдельно вызывающим кодом
      const referenced = byName.get(fk.referencesTable);
      if (referenced !== undefined) visit(referenced);
    }
    creationOrder.push(table);
  }

  for (const table of tables) visit(table);
  return creationOrder.toReversed();
}
