import { asUuid, type OccurrenceSeq, type Uuid } from '../values.js';

import { sha1 } from './internal/sha1.js';

/**
 * Детерминированный UUIDv5 (RFC 4122 §4.3) для occurrence/subtask/checklist
 * повторов — единственное исключение из UUIDv7 (`00§6`, конспект §4,
 * `02§13`). Смысл: два офлайн-устройства, независимо завершившие один и тот
 * же occurrence, обязаны вычислить ОДИН И ТОТ ЖЕ id следующего графа —
 * иначе после синхронизации возникает дубль вместо merge по id.
 *
 * Формулы вывода (конспект §4, дословно):
 * ```
 * occurrence_id = UUIDv5(namespace=series_id, name="occurrence:" + occurrence_seq)
 * child_id      = UUIDv5(namespace=occurrence_id, name="subtask:" + stable_template_item_id)
 * checklist_id  = UUIDv5(namespace=occurrence_id, name="checklist:" + stable_template_item_id)
 * ```
 */

function parseUuidBytes(uuid: Uuid): Uint8Array {
  const hex = uuid.replaceAll('-', '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function formatUuidBytes(bytes: Uint8Array): Uuid {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  return asUuid(uuid);
}

/**
 * `UUIDv5(namespace, name)` общего вида — RFC 4122 §4.3, версия 5. Проверена
 * в тестах против официального тестового вектора Python'овского
 * `uuid.uuid5(NAMESPACE_DNS, "python.org")`.
 */
export function uuidV5(namespace: Uuid, name: string): Uuid {
  const namespaceBytes = parseUuidBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const combined = new Uint8Array(namespaceBytes.length + nameBytes.length);
  combined.set(namespaceBytes);
  combined.set(nameBytes, namespaceBytes.length);

  const hash = sha1(combined);
  const result = hash.slice(0, 16);
  result[6] = ((result[6] ?? 0) & 0x0f) | 0x50; // версия 5
  result[8] = ((result[8] ?? 0) & 0x3f) | 0x80; // вариант RFC 4122
  return formatUuidBytes(result);
}

/** `occurrence_id` следующего occurrence серии (конспект §4, `02§13`). */
export function deriveOccurrenceId(seriesId: Uuid, occurrenceSeq: OccurrenceSeq): Uuid {
  return uuidV5(seriesId, `occurrence:${occurrenceSeq}`);
}

/** `child_id` сгенерированного subtask'а occurrence'а (конспект §4, `02§13`). */
export function deriveSubtaskId(occurrenceId: Uuid, stableTemplateItemId: string): Uuid {
  return uuidV5(occurrenceId, `subtask:${stableTemplateItemId}`);
}

/** `checklist_id` сгенерированного пункта чек-листа (конспект §4, `02§13`). */
export function deriveChecklistItemId(occurrenceId: Uuid, stableTemplateItemId: string): Uuid {
  return uuidV5(occurrenceId, `checklist:${stableTemplateItemId}`);
}
