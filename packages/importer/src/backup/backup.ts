/**
 * Сборка бэкапа (`01§27`) и его чтение обратно.
 *
 * Манифест содержит контрольные суммы КАЖДОГО файла данных. Их смысл не
 * «защита от злоумышленника» (подделать можно и манифест), а обнаружение
 * порчи: обрезанная закачка, битый сектор, архив, отредактированный
 * вручную. Поэтому чтение сверяет суммы и честно сообщает, какой файл не
 * сошёлся, вместо того чтобы восстановить половину графа.
 */
import type { WorkspaceSnapshot } from './snapshot.js';
import {
  decodeText,
  encodeText,
  packArchive,
  sha256Hex,
  unpackArchive,
  type ArchiveFiles,
  type UnpackRejectionCode,
} from './archive.js';
import { fromJsonl, toJsonl } from './codec.js';
import { BACKUP_SCHEMA_VERSION, DATA_PATHS, MANIFEST_PATH, type BackupManifest } from './format.js';

export interface BuildBackupOptions {
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly locale: string;
}

export async function buildBackupArchive(
  snapshot: WorkspaceSnapshot,
  options: BuildBackupOptions,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    [DATA_PATHS.projects]: encodeText(toJsonl(snapshot.projects)),
    [DATA_PATHS.sections]: encodeText(toJsonl(snapshot.sections)),
    [DATA_PATHS.tasks]: encodeText(toJsonl(snapshot.tasks)),
    [DATA_PATHS.labels]: encodeText(toJsonl(snapshot.labels)),
    [DATA_PATHS.taskLabels]: encodeText(toJsonl(snapshot.taskLabels)),
    [DATA_PATHS.checklist]: encodeText(toJsonl(snapshot.checklistItems)),
    [DATA_PATHS.reminders]: encodeText(toJsonl(snapshot.reminders)),
    [DATA_PATHS.recurrence]: encodeText(toJsonl(snapshot.recurrenceSeries)),
    [DATA_PATHS.taskLinks]: encodeText(toJsonl(snapshot.taskLinks)),
    [DATA_PATHS.settings]: encodeText(JSON.stringify(snapshot.settings, null, 2)),
  };

  const checksums: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    checksums[path] = await sha256Hex(content);
  }

  const manifest: BackupManifest = {
    schema_version: BACKUP_SCHEMA_VERSION,
    app_version: options.appVersion,
    exported_at: options.exportedAt,
    locale: options.locale,
    checksums,
  };
  files[MANIFEST_PATH] = encodeText(JSON.stringify(manifest, null, 2));
  return packArchive(files);
}

export type ReadBackupRejectionCode =
  | UnpackRejectionCode
  | 'manifest_missing'
  | 'manifest_unreadable'
  | 'schema_too_new'
  | 'checksum_mismatch';

export type ReadBackupResult =
  | {
      readonly status: 'ok';
      readonly manifest: BackupManifest;
      readonly snapshot: WorkspaceSnapshot;
    }
  | {
      readonly status: 'rejected';
      readonly code: ReadBackupRejectionCode;
      readonly path?: string;
    };

function readJsonl<T>(files: ArchiveFiles, path: string): readonly T[] {
  const content = files[path];
  // Отсутствующий файл читается как пустой: архив версии 1 без
  // `task-links.jsonl` — законный архив, а не битый (см. `format.ts`).
  if (content === undefined) return [];
  return fromJsonl(decodeText(content)) as readonly T[];
}

export async function readBackupArchive(bytes: Uint8Array): Promise<ReadBackupResult> {
  const unpacked = unpackArchive(bytes);
  if (unpacked.status === 'rejected') {
    return {
      status: 'rejected',
      code: unpacked.code,
      ...(unpacked.path === undefined ? {} : { path: unpacked.path }),
    };
  }
  const files = unpacked.files;

  const manifestBytes = files[MANIFEST_PATH];
  if (manifestBytes === undefined) return { status: 'rejected', code: 'manifest_missing' };
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(decodeText(manifestBytes)) as BackupManifest;
  } catch {
    return { status: 'rejected', code: 'manifest_unreadable' };
  }
  if (typeof manifest.schema_version !== 'number') {
    return { status: 'rejected', code: 'manifest_unreadable' };
  }
  // Архив более новой версии читать нельзя: молча пропустить незнакомые
  // поля — значит потерять данные при следующем экспорте.
  if (manifest.schema_version > BACKUP_SCHEMA_VERSION) {
    return { status: 'rejected', code: 'schema_too_new' };
  }

  for (const [path, expected] of Object.entries(manifest.checksums ?? {})) {
    const content = files[path];
    if (content === undefined) continue;
    const actual = await sha256Hex(content);
    if (actual !== expected) return { status: 'rejected', code: 'checksum_mismatch', path };
  }

  const settingsBytes = files[DATA_PATHS.settings];
  let settings: Record<string, string> = {};
  if (settingsBytes !== undefined) {
    try {
      settings = JSON.parse(decodeText(settingsBytes)) as Record<string, string>;
    } catch {
      return { status: 'rejected', code: 'manifest_unreadable', path: DATA_PATHS.settings };
    }
  }

  return {
    status: 'ok',
    manifest,
    snapshot: {
      projects: readJsonl(files, DATA_PATHS.projects),
      sections: readJsonl(files, DATA_PATHS.sections),
      tasks: readJsonl(files, DATA_PATHS.tasks),
      labels: readJsonl(files, DATA_PATHS.labels),
      taskLabels: readJsonl(files, DATA_PATHS.taskLabels),
      checklistItems: readJsonl(files, DATA_PATHS.checklist),
      reminders: readJsonl(files, DATA_PATHS.reminders),
      recurrenceSeries: readJsonl(files, DATA_PATHS.recurrence),
      taskLinks: readJsonl(files, DATA_PATHS.taskLinks),
      attachments: [],
      settings,
    },
  };
}
