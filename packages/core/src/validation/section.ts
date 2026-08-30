import { unicodeLength } from './title.js';
import { buildResult, makeIssue, type ValidationIssue, type ValidationResult } from './types.js';

/** Правило 23 (часть Section): title 1..80 (`01§1`). */
export interface SectionValidationInput {
  readonly title: string;
}

const TITLE_MAX_LENGTH = 80;

export function validateSection(input: SectionValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];
  const length = unicodeLength(input.title);
  if (length < 1 || length > TITLE_MAX_LENGTH) {
    issues.push(makeIssue(23, 'SECTION_TITLE_LENGTH_INVALID', 'blocking', 'title', { length }));
  }
  return buildResult(issues);
}
