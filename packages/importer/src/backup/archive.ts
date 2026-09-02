/**
 * Сборка и разбор `shagi-backup-v1.zip` (`01§27`) и распаковка чужих
 * архивов (Todoist backup ZIP, `01§26`).
 *
 * ZIP берётся у `fflate` (MIT, без собственных зависимостей, работает
 * одинаково в браузере, в Tauri-WebView и в Node) — ADR-0007. Писать
 * контейнер руками ради экономии восьми килобайт значило бы завести
 * собственный слой бинарного разбора там, где ошибка стоит потерянного
 * бэкапа.
 *
 * Ограничения `01§26` («compressed <=100MB, expanded <=500MB, <=10k
 * entries, no path traversal, no recursive archive expansion») проверяются
 * ЗДЕСЬ, на входе, а не в вызывающем коде: архив приходит извне и уже на
 * этом рубеже обязан перестать быть опасным.
 */
import { unzipSync, zipSync } from 'fflate';

import { ARCHIVE_LIMITS, isNestedArchive, isSafeArchivePath } from './format.js';

export type ArchiveFiles = Readonly<Record<string, Uint8Array>>;

export type UnpackRejectionCode =
  | 'too_large_compressed'
  | 'too_large_expanded'
  | 'too_many_entries'
  | 'unsafe_path'
  | 'nested_archive'
  | 'not_an_archive';

export type UnpackResult =
  | { readonly status: 'ok'; readonly files: ArchiveFiles }
  | { readonly status: 'rejected'; readonly code: UnpackRejectionCode; readonly path?: string };

export function packArchive(files: ArchiveFiles): Uint8Array {
  // `level: 6` — компромисс по умолчанию: бэкап на несколько тысяч задач
  // сжимается за доли секунды, а разница с максимальным уровнем в размере
  // единицы процентов.
  return zipSync({ ...files }, { level: 6 });
}

export function unpackArchive(bytes: Uint8Array): UnpackResult {
  if (bytes.length > ARCHIVE_LIMITS.maxCompressedBytes) {
    return { status: 'rejected', code: 'too_large_compressed' };
  }
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes);
  } catch {
    return { status: 'rejected', code: 'not_an_archive' };
  }

  const entries = Object.entries(raw);
  if (entries.length > ARCHIVE_LIMITS.maxEntries) {
    return { status: 'rejected', code: 'too_many_entries' };
  }

  let expanded = 0;
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of entries) {
    // Каталоги в ZIP — записи нулевой длины с `/` на конце; они не файлы и
    // проверку пути не проходят (пустой последний сегмент), поэтому
    // отсеиваются раньше.
    if (path.endsWith('/')) continue;
    if (!isSafeArchivePath(path)) return { status: 'rejected', code: 'unsafe_path', path };
    if (isNestedArchive(path)) return { status: 'rejected', code: 'nested_archive', path };
    expanded += content.length;
    if (expanded > ARCHIVE_LIMITS.maxExpandedBytes) {
      return { status: 'rejected', code: 'too_large_expanded' };
    }
    files[path] = content;
  }
  return { status: 'ok', files };
}

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

export function decodeText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function encodeText(text: string): Uint8Array {
  return encoder.encode(text);
}

/**
 * SHA-256 в hex — контрольные суммы манифеста (`01§27`). Через Web Crypto
 * (`crypto.subtle`), который есть и в браузере, и в Node 24, и в
 * Tauri-WebView: собственная реализация хеша здесь была бы лишним кодом с
 * теми же гарантиями.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Копия в свежий `ArrayBuffer`: `Uint8Array` может смотреть в
  // `SharedArrayBuffer`, который `crypto.subtle.digest` не принимает по
  // типам. Копия дешева и снимает вопрос целиком.
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
