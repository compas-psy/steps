import { unicodeLength } from './title.js';
import { buildResult, makeIssue, type ValidationIssue, type ValidationResult } from './types.js';

/**
 * Нормализация имени метки для сравнения уникальности (правило 24, `01§1`:
 * "unique case-insensitive after Unicode normalization"). NFKC — та же форма
 * нормализации, что и остальной текстовый pipeline продукта (NLP §01§4 шаг
 * 1, поиск §01§15) — не изобретаем третью форму без причины.
 *
 * **Важно** (см. задание пакета работ E01.3, различие с поиском `01§15`):
 * здесь **не** сворачивается `ё`→`е` — `JS`-нижний регистр их не путает
 * (`"Ё".toLowerCase() === "ё"`, отдельный от `"е"` кодпоинт), и это ровно то
 * поведение, которое нужно: по ТЗ `ё`/`е` **различаются** при сопоставлении
 * меток (в отличие от полнотекстового поиска `01§15`, где они специально
 * складываются). Не перепутать эти два места — задание отдельно предупреждает
 * об этом.
 */
export function normalizeLabelName(displayName: string): string {
  return displayName.normalize('NFKC').toLowerCase();
}

/** Правило 23 (часть Label): title (`displayName`) 1..80 (`01§1`). Правило
 * 24: уникальность в scope пользователя. */
export interface LabelValidationInput {
  readonly displayName: string;
}

export interface LabelValidationContext {
  /** Уже нормализованные имена существующих меток в scope пользователя —
   * **не считая** саму редактируемую метку (иначе она конфликтовала бы сама
   * с собой при повторном сохранении без изменений). */
  readonly existingNormalizedNames: readonly string[];
}

const TITLE_MAX_LENGTH = 80;

export function validateLabel(
  input: LabelValidationInput,
  context: LabelValidationContext,
): ValidationResult {
  const issues: ValidationIssue[] = [...checkTitle(input), ...checkUniqueness(input, context)];
  return buildResult(issues);
}

/** Правило 23. */
function checkTitle(input: LabelValidationInput): ValidationIssue[] {
  const length = unicodeLength(input.displayName);
  if (length < 1 || length > TITLE_MAX_LENGTH) {
    return [makeIssue(23, 'LABEL_TITLE_LENGTH_INVALID', 'blocking', 'displayName', { length })];
  }
  return [];
}

/** Правило 24. */
function checkUniqueness(
  input: LabelValidationInput,
  context: LabelValidationContext,
): ValidationIssue[] {
  const normalized = normalizeLabelName(input.displayName);
  if (context.existingNormalizedNames.includes(normalized)) {
    return [makeIssue(24, 'LABEL_NOT_UNIQUE', 'blocking', 'displayName', { normalized })];
  }
  return [];
}
