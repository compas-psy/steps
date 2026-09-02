/**
 * `@shagi/importer` — импорт Todoist/CSV и бэкапов ШАГОВ (SPEC/00 §14).
 *
 * Использует только публичные документированные форматы CSV/backup —
 * без зависимости от приватных API Todoist (§14, «Dependency / IP gate»).
 * Импортированные задачи заходят в домен через `CreateTaskCommand`
 * (`@shagi/core`), как и любой другой источник — импорт не пишет в
 * хранилище напрямую.
 *
 * Здесь же живёт ЭКСПОРТ бэкапа (`01§27`), хотя имя пакета говорит только
 * про импорт: формат `shagi-backup-v1` один и тот же на запись и на
 * чтение, и разносить его по двум пакетам значило бы завести две копии
 * описания одного формата, которые разойдутся при первой же правке.
 */
export const PACKAGE_NAME = '@shagi/importer' as const;

export { parseCsvRecords, parseCsvTable, type CsvRow, type CsvTable } from './csv/parse.js';
export { escapeCsvFormula, unescapeCsvFormula, formatCsvCell } from './csv/sanitize.js';
export { parseTodoistDate, type ParsedTodoistDate } from './todoist/date.js';
export {
  buildTodoistProjectPlan,
  COMMENTS_BLOCK_TITLE,
  COMMENTS_OVERFLOW_FILE,
  DESCRIPTION_LIMIT,
  type BuildProjectPlanInput,
  type BuildProjectPlanResult,
} from './todoist/plan.js';
export {
  parseTodoistCsv,
  parseTodoistFiles,
  projectTitleFromFileName,
  type TodoistCsvFile,
} from './todoist/index.js';
export type {
  ImportRejection,
  ImportRejectionCode,
  ImportWarning,
  ImportWarningCode,
  PlannedAttachment,
  PlannedTask,
  TodoistImportPlan,
  TodoistParseResult,
  TodoistProjectPlan,
} from './todoist/model.js';
export {
  applyTodoistImport,
  IMPORT_BATCH_STATUS,
  ROLLBACK_WINDOW_MINUTES,
  type ApplyImportDeps,
  type ImportOutcome,
} from './apply/apply-import.js';
export {
  canRollbackImport,
  rollbackImport,
  type RollbackDeps,
  type RollbackRefusalCode,
  type RollbackResult,
} from './apply/rollback-import.js';
export {
  ARCHIVE_LIMITS,
  BACKUP_FILE_NAME,
  BACKUP_SCHEMA_VERSION,
  DATA_PATHS,
  isNestedArchive,
  isSafeArchivePath,
  MANIFEST_PATH,
  type BackupManifest,
} from './backup/format.js';
export {
  decodeText,
  encodeText,
  packArchive,
  sha256Hex,
  unpackArchive,
  type ArchiveFiles,
  type UnpackRejectionCode,
  type UnpackResult,
} from './backup/archive.js';
export {
  decodeBackupValue,
  encodeBackupValue,
  fromJsonl,
  toJsonl,
  type JsonValue,
} from './backup/codec.js';
export {
  buildBackupArchive,
  readBackupArchive,
  type BuildBackupOptions,
  type ReadBackupRejectionCode,
  type ReadBackupResult,
} from './backup/backup.js';
export { EMPTY_SNAPSHOT, isSnapshotEmpty, type WorkspaceSnapshot } from './backup/snapshot.js';
export {
  NO_EXISTING_IDS,
  planRestore,
  type ExistingIds,
  type PlanRestoreOptions,
  type RestoreMode,
  type RestorePlan,
} from './backup/restore.js';
export {
  applyRestore,
  type ApplyRestoreDeps,
  type RestoreSummary,
} from './backup/apply-restore.js';
