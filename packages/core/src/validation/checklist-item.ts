import { hasReadableContent, normalizeTitleWhitespace, unicodeLength } from './title.js';
import { buildResult, makeIssue, type ValidationIssue, type ValidationResult } from './types.js';

/**
 * Валидатор текста пункта чек-листа (`01§10`: `{text, done, rank}`;
 * `02§2` `checklist_items.text` — тип `text`, точная длина нигде не
 * зафиксирована). Решение пакета работ E10 (в конспекте
 * `.ultraplan/research/01-domain.md` §2 нет отдельного пронумерованного
 * правила под текст пункта чек-листа — правила 1–38 исчерпывают
 * задокументированный список): переиспользована та же граница 1..500
 * Unicode-символов и то же понятие «читаемости», что правило 14 для
 * `Task.title` (`validation/task.ts`) — тот же жанр короткого
 * пользовательского текста, нет причины придумывать другую цифру без
 * основания в спеке. Функции нормализации (`normalizeTitleWhitespace`,
 * `hasReadableContent`, `unicodeLength`) переиспользованы из `title.ts`
 * буквально (CLAUDE.md, «не дублировать без причины») — они не завязаны на
 * `Task`, уже документированы в `title.ts` как «полезны сами по себе».
 *
 * Пронумерован как правило 39 — продолжение сквозной нумерации конспекта
 * §2 (последнее правило там — 38), а не sentinel вроде `0`: `rule` в
 * `ValidationIssue` существует для трассируемости к конкретному пункту
 * спеки/конспекта, и цепочка нумерации не прерывается тем, что это правило
 * добавлено позже, в отдельном пакете работ.
 */
export interface ChecklistItemValidationInput {
  readonly text: string;
}

const TEXT_MAX_LENGTH = 500;

export function validateChecklistItem(input: ChecklistItemValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [...checkText(input)];
  return buildResult(issues);
}

/** Правило 39 (расширение конспекта §2 этим пакетом работ — см. комментарий
 * модуля): длина 1..500 после нормализации + читаемость, тот же приём, что
 * правило 14 (`checkTitle`, `validation/task.ts`). */
function checkText(input: ChecklistItemValidationInput): ValidationIssue[] {
  const normalized = normalizeTitleWhitespace(input.text);
  const length = unicodeLength(normalized);
  if (length < 1 || length > TEXT_MAX_LENGTH) {
    return [makeIssue(39, 'CHECKLIST_ITEM_TEXT_LENGTH_INVALID', 'blocking', 'text', { length })];
  }
  if (!hasReadableContent(normalized)) {
    return [makeIssue(39, 'CHECKLIST_ITEM_TEXT_NOT_READABLE', 'blocking', 'text')];
  }
  return [];
}
