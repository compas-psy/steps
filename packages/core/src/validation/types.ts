import type { ValidationErrorCode } from './error-codes.js';

/**
 * Три класса результата (задание E01.3, `02§11.1`), а не булево:
 * блокирующие правила запрещают сохранение, предупреждающие — разрешают его
 * с уведомлением пользователя, а «явно валидные» комбинации (§2 пп.35–38)
 * вообще не порождают issue — валидатор обязан их молча пропускать.
 */
export type ValidationSeverity = 'blocking' | 'warning';

/**
 * Один найденный issue. `rule` — номер правила из конспекта
 * (`.ultraplan/research/01-domain.md` раздел 2) для трассируемости от теста
 * к ТЗ; `code` — стабильный машинно-читаемый код (`03§19`); `field` —
 * конкретное поле, на которое должен указать будущий UI. `details` несёт
 * произвольные диагностические значения (лимиты, фактические числа) —
 * не часть контракта кода/поля, только вспомогательная информация.
 */
export interface ValidationIssue {
  readonly rule: number;
  readonly code: ValidationErrorCode;
  readonly severity: ValidationSeverity;
  readonly field: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Итог валидации одной мутации. `valid=false` тогда и только тогда, когда
 * среди `issues` есть хотя бы один `severity='blocking'` — предупреждения
 * сохранение не блокируют (`02§11.1`, §2 «Предупреждающие»).
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/** Конструктор одного issue — избавляет каждое правило от ручной сборки
 * объекта и `exactOptionalPropertyTypes`-совместимого пропуска `details`. */
export function makeIssue(
  rule: number,
  code: ValidationErrorCode,
  severity: ValidationSeverity,
  field: string,
  details?: Readonly<Record<string, unknown>>,
): ValidationIssue {
  return details === undefined
    ? { rule, code, severity, field }
    : { rule, code, severity, field, details };
}

/** Собирает список issue в итоговый результат — единственное место, где
 * решается, что значит «валидно» (нет блокирующих issue). */
export function buildResult(issues: readonly ValidationIssue[]): ValidationResult {
  return {
    valid: !issues.some((issueItem) => issueItem.severity === 'blocking'),
    issues,
  };
}
