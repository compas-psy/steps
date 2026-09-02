/**
 * Формат `shagi-backup-v1.zip` — `01§27`, дословный состав:
 *
 *   manifest.json
 *   data/projects.jsonl
 *   data/sections.jsonl
 *   data/tasks.jsonl
 *   data/labels.jsonl
 *   data/checklist.jsonl
 *   data/reminders.jsonl
 *   data/recurrence.jsonl
 *   data/settings.json
 *   attachments/<attachment-id>
 *
 * «Manifest: schema_version, app_version, exported_at, locale, checksums.
 *  Never include auth/device secrets.»
 *
 * Два файла ТЗ не перечисляет, но без них граф не восстанавливается:
 * связи «задача ↔ метка» и связи между задачами. Они лежат рядом с
 * остальными в `data/` и НЕ ломают чтение старых архивов: читатель
 * относится к отсутствующему файлу как к пустому. Добавление отмечено
 * здесь явно, чтобы расхождение с §27 было видно, а не обнаружилось при
 * первом восстановлении с потерянными метками.
 *
 * Секретов в архиве нет по построению: сюда попадают только доменные
 * сущности, а `syncOutbox`/`syncConflicts`/учётные данные не входят в
 * снимок вовсе (см. `WorkspaceSnapshot`).
 */

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_FILE_NAME = 'shagi-backup-v1.zip';
export const MANIFEST_PATH = 'manifest.json';

export const DATA_PATHS = {
  projects: 'data/projects.jsonl',
  sections: 'data/sections.jsonl',
  tasks: 'data/tasks.jsonl',
  labels: 'data/labels.jsonl',
  taskLabels: 'data/task-labels.jsonl',
  checklist: 'data/checklist.jsonl',
  reminders: 'data/reminders.jsonl',
  recurrence: 'data/recurrence.jsonl',
  taskLinks: 'data/task-links.jsonl',
  settings: 'data/settings.json',
} as const;

export interface BackupManifest {
  readonly schema_version: number;
  readonly app_version: string;
  readonly exported_at: string;
  readonly locale: string;
  /** Контрольные суммы содержимого: путь → sha256 в hex. */
  readonly checksums: Readonly<Record<string, string>>;
}

/**
 * Границы безопасности распаковки — `01§26` дословно: «compressed <=100MB,
 * expanded <=500MB, <=10k entries, no path traversal, no recursive archive
 * expansion».
 */
export const ARCHIVE_LIMITS = {
  maxCompressedBytes: 100 * 1024 * 1024,
  maxExpandedBytes: 500 * 1024 * 1024,
  maxEntries: 10_000,
} as const;

/**
 * Безопасен ли путь внутри архива. Отвергает выход за пределы (`..`),
 * абсолютные пути и диски Windows — «no path traversal». Отдельная чистая
 * функция, потому что это правило безопасности и оно обязано иметь
 * собственный тест, а не проверяться попутно внутри распаковщика.
 */
export function isSafeArchivePath(path: string): boolean {
  if (path === '') return false;
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(path)) return false;
  const segments = path.split(/[/\\]/);
  return !segments.includes('..') && !segments.includes('');
}

/** Вложенный архив внутри архива — «no recursive archive expansion». */
export function isNestedArchive(path: string): boolean {
  return /\.(zip|tar|gz|tgz|7z|rar)$/i.test(path);
}
