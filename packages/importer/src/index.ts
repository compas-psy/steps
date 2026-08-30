/**
 * `@shagi/importer` — импорт Todoist/CSV и бэкапов ШАГОВ (SPEC/00 §14).
 *
 * Использует только публичные документированные форматы CSV/backup —
 * без зависимости от приватных API Todoist (§14, «Dependency / IP gate»).
 * Импортированные задачи заходят в домен через `CreateTaskCommand`
 * (`@shagi/core`), как и любой другой источник — импорт не пишет в
 * хранилище напрямую.
 */
export const PACKAGE_NAME = '@shagi/importer' as const;
