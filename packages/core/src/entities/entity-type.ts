/**
 * Замкнутый список синхронизируемых сущностей — используется в `sync_outbox`
 * и `sync_conflicts` (`02§2`) для маркировки, к какой таблице относится
 * запись. Конкретные строковые значения не зафиксированы дословно в `02§2`
 * (поле там просто `entity_type: text`) — набор значений здесь получен из
 * состава схемы (раздел 1 конспекта), а не изобретён. `import_batches`,
 * `sync_outbox` и `sync_conflicts` сюда не входят — они не мутируются через
 * обычный sync merge (транспорт/учёт, а не пользовательские данные).
 */
export type EntityType =
  | 'task'
  | 'project'
  | 'section'
  | 'label'
  | 'task_label'
  | 'checklist_item'
  | 'reminder'
  | 'recurrence_series'
  | 'attachment'
  | 'task_link';
