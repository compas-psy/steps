/**
 * `@shagi/core/validation` — единый валидатор доменных инвариантов (пакет
 * работ E01.3, `02§11.1`). Собственный барель этого подкаталога — намеренно
 * не сведён в общий `packages/core/src/index.ts` (параллельно с ним
 * работает другой пакет работ); интеграция в общий публичный API пакета —
 * отдельный шаг за пределами этого пакета работ.
 *
 * Три класса результата (не булево): блокирующие правила 1–28 запрещают
 * сохранение, предупреждающие 32–34 разрешают его с уведомлением, явно
 * валидные комбинации 35–38 не порождают ни одного issue. Правило 29
 * (ownership входящей sync-мутации) и правила 30/31 (recurrence merge,
 * эпик E11) объявлены как форма контракта в `sync-stubs.ts`, но не
 * реализованы и не вызываются отсюда — см. комментарий этого модуля.
 */

// --- Общие типы результата ---------------------------------------------------
export {
  buildResult,
  makeIssue,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSeverity,
} from './types.js';
export { type ValidationErrorCode } from './error-codes.js';

// --- Единая точка входа -------------------------------------------------------
export { validateDomainMutation, type DomainMutationInput } from './validate.js';

// --- Task: правила 1–21, 25, 26, 32, 33 --------------------------------------
export {
  validateTask,
  type TaskParentSnapshot,
  type TaskValidationContext,
  type TaskValidationInput,
} from './task.js';

// --- Вспомогательное для заголовка (правило 14) ------------------------------
export { hasReadableContent, normalizeTitleWhitespace, unicodeLength } from './title.js';

// --- Project: правила 22, 27, 28 ----------------------------------------------
export {
  validateProject,
  type ProjectMutationOrigin,
  type ProjectValidationContext,
  type ProjectValidationInput,
} from './project.js';

// --- Section: правило 23 ------------------------------------------------------
export { validateSection, type SectionValidationInput } from './section.js';

// --- Label: правила 23, 24 -----------------------------------------------------
export {
  normalizeLabelName,
  validateLabel,
  type LabelValidationContext,
  type LabelValidationInput,
} from './label.js';

// --- Reminder: правило 34 ------------------------------------------------------
export {
  validateExplicitReminder,
  type ExplicitReminderValidationInput,
  type ReminderTaskDeadline,
} from './reminder.js';

// --- ChecklistItem: правило 39 (пакет работ E10) -------------------------------
export { validateChecklistItem, type ChecklistItemValidationInput } from './checklist-item.js';

// --- Задел на правила 29 (ownership), 30/31 (recurrence merge, эпик E11) ------
export {
  validateOwnership,
  validateSeriesDeleteBoundary,
  validateTemplateRevisionReconciliation,
  type OwnershipCheckContext,
  type SeriesDeleteBoundaryContext,
  type TemplateRevisionReconciliationContext,
} from './sync-stubs.js';
