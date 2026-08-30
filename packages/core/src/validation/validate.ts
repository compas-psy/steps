import {
  validateExplicitReminder,
  type ExplicitReminderValidationInput,
  type ReminderTaskDeadline,
} from './reminder.js';
import { validateLabel, type LabelValidationContext, type LabelValidationInput } from './label.js';
import {
  validateProject,
  type ProjectValidationContext,
  type ProjectValidationInput,
} from './project.js';
import { validateSection, type SectionValidationInput } from './section.js';
import { validateTask, type TaskValidationContext, type TaskValidationInput } from './task.js';
import type { ValidationResult } from './types.js';

/**
 * **Единственная точка входа** валидатора доменных инвариантов (задание
 * E01.3, `02§11.1`): и локальные команды, и входящий sync-патч обязаны
 * пройти через `validateDomainMutation`, а не через набор разрозненных
 * проверок, вызываемых по месту. Причина по разведке: «если валидатор
 * разъедется на два, поведение натива и веба неизбежно разойдётся» — не
 * может разъехаться то, чего нет в двух экземплярах.
 *
 * Диспетчер по `entity` — тонкий; вся содержательная логика в отдельных
 * `task.ts`/`project.ts`/`section.ts`/`label.ts`/`reminder.ts`, каждый со
 * своим набором правил из конспекта. Дискриминированное объединение по
 * `entity` не даёт вызвать `validateProject` данными `Task`, что и есть
 * весь смысл единой точки входа — не два параллельных API, которые можно
 * незаметно рассинхронизировать.
 */
export type DomainMutationInput =
  | {
      readonly entity: 'task';
      readonly data: TaskValidationInput;
      readonly context: TaskValidationContext;
    }
  | {
      readonly entity: 'project';
      readonly data: ProjectValidationInput;
      readonly context: ProjectValidationContext;
    }
  | { readonly entity: 'section'; readonly data: SectionValidationInput }
  | {
      readonly entity: 'label';
      readonly data: LabelValidationInput;
      readonly context: LabelValidationContext;
    }
  | {
      readonly entity: 'explicit_reminder';
      readonly data: ExplicitReminderValidationInput;
      readonly context: ReminderTaskDeadline;
    };

export function validateDomainMutation(input: DomainMutationInput): ValidationResult {
  switch (input.entity) {
    case 'task':
      return validateTask(input.data, input.context);
    case 'project':
      return validateProject(input.data, input.context);
    case 'section':
      return validateSection(input.data);
    case 'label':
      return validateLabel(input.data, input.context);
    case 'explicit_reminder':
      return validateExplicitReminder(input.data, input.context);
  }
}
