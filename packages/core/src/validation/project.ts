import { unicodeLength } from './title.js';
import { buildResult, makeIssue, type ValidationIssue, type ValidationResult } from './types.js';

/** Правило 22: Project title 1..120, description 0..10 000. Ни trim, ни
 * нормализация CR/LF/TAB для Project/Section/Label в конспекте/`01§1` не
 * упомянуты (в отличие от Task title) — считаем длину буквально, не
 * придумывая по аналогии поведение, которого спека не называет. */
export interface ProjectValidationInput {
  readonly title: string;
  readonly description: string;
}

/**
 * Происхождение мутации — необходимо правилу 27 (`01§12`): Free-лимит
 * гейтит только **обычное** create/reactivate, а не import/backup/
 * account-merge ("миграция никогда не отбрасывает данные, лишний excess
 * остаётся доступным, гейтится только последующее создание", находка №39
 * независимого review).
 */
export type ProjectMutationOrigin =
  'create' | 'reactivate' | 'import' | 'restore' | 'account_merge';

/**
 * Правило 28 (технический потолок 500) не имеет в конспекте/`01§1` того же
 * явного текста про исключение для import/restore/account_merge, какой есть
 * у правила 27 в `01§12`. Решение здесь: применить тот же origin-гейт, что
 * и к правилу 27, — оба лимита сгруппированы в одном месте конспекта и
 * `entities/project.ts` под общей пометкой "кросс-строчные/счётные
 * проверки", а общий принцип "миграция никогда не отбрасывает данные"
 * проходит через весь `02§11`/`01§26` не только применительно к 10-лимиту.
 * Это инференс, а не буквальная цитата ТЗ — явно отмечен в отчёте пакета
 * работ E01.3 как решение, которое стоит подтвердить у владельца, если оно
 * когда-нибудь разойдётся с намерением продукта.
 */
export interface ProjectValidationContext {
  readonly origin: ProjectMutationOrigin;
  /** Число активных (не архивных) проектов в scope пользователя, **не
   * считая** валидируемый проект. */
  readonly activeProjectCountExcludingThis: number;
  /** Free/Pro entitlement — вычисляется billing-слоем (`03§11`), сюда
   * приходит уже готовым булевым флагом; сам billing вне этого пакета работ. */
  readonly hasProEntitlement: boolean;
}

const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 10_000;
const FREE_PROJECT_LIMIT = 10;
const TECHNICAL_PROJECT_LIMIT = 500;

/** Гейтится только обычное create/reactivate (`01§12`) — не import/backup/
 * account-merge. */
const GATED_ORIGINS: ReadonlySet<ProjectMutationOrigin> = new Set(['create', 'reactivate']);

export function validateProject(
  input: ProjectValidationInput,
  context: ProjectValidationContext,
): ValidationResult {
  const issues: ValidationIssue[] = [
    ...checkTitle(input),
    ...checkDescription(input),
    ...checkProjectLimits(context),
  ];
  return buildResult(issues);
}

/** Правило 22 (title). */
function checkTitle(input: ProjectValidationInput): ValidationIssue[] {
  const length = unicodeLength(input.title);
  if (length < 1 || length > TITLE_MAX_LENGTH) {
    return [makeIssue(22, 'PROJECT_TITLE_LENGTH_INVALID', 'blocking', 'title', { length })];
  }
  return [];
}

/** Правило 22 (description). */
function checkDescription(input: ProjectValidationInput): ValidationIssue[] {
  const length = unicodeLength(input.description);
  if (length > DESCRIPTION_MAX_LENGTH) {
    return [makeIssue(22, 'PROJECT_DESCRIPTION_TOO_LONG', 'blocking', 'description', { length })];
  }
  return [];
}

/** Правила 27 (Free-лимит 10) и 28 (технический потолок 500) — оба гейтятся
 * только на обычном create/reactivate (см. комментарий у `ProjectValidationContext`). */
function checkProjectLimits(context: ProjectValidationContext): ValidationIssue[] {
  if (!GATED_ORIGINS.has(context.origin)) {
    return [];
  }

  const attemptedCount = context.activeProjectCountExcludingThis + 1;
  const issues: ValidationIssue[] = [];

  if (!context.hasProEntitlement && attemptedCount > FREE_PROJECT_LIMIT) {
    issues.push(
      makeIssue(27, 'PROJECT_LIMIT_REACHED', 'blocking', 'activeProjectCount', {
        limitType: 'free',
        limit: FREE_PROJECT_LIMIT,
        attemptedCount,
      }),
    );
  }

  if (attemptedCount > TECHNICAL_PROJECT_LIMIT) {
    issues.push(
      makeIssue(28, 'PROJECT_LIMIT_REACHED', 'blocking', 'activeProjectCount', {
        limitType: 'technical',
        limit: TECHNICAL_PROJECT_LIMIT,
        attemptedCount,
      }),
    );
  }

  return issues;
}
