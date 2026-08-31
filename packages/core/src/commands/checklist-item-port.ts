import type { Temporal } from '@js-temporal/polyfill';

import type { ChecklistItem } from '../entities/checklist-item.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import type { CommandStoragePort } from './storage-port.js';

/**
 * Зависимости команд ChecklistItem (пакет работ E10, `01§10`). Форма
 * буквально идентична `TaskCommandDeps` (`commands/types.ts`) — не
 * случайное совпадение, а прямое следствие решения `storage-port.ts`: и
 * Task, и ChecklistItem читаются/пишутся через один и тот же
 * `CommandStoragePort` (см. комментарий `CommandChecklistItemReader` там —
 * `createChecklistItemCommand` обязан перечитать родительскую Task для
 * повторной валидации правила 17, поэтому ему в любом случае нужен именно
 * этот порт, отдельный parallel-порт под checklist item добавил бы только
 * лишнее поле в deps без всякой пользы). Заведён отдельным именованным
 * типом (не просто реэкспорт `TaskCommandDeps`), чтобы сигнатуры команд
 * этого файла читались по имени входа, как у соседних файлов
 * (`SectionCommandDeps`, `ProjectCommandDeps`, `ReminderCommandDeps`).
 */
export interface ChecklistItemCommandDeps {
  readonly storage: CommandStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateId?: () => Uuid;
  readonly generateOpId?: () => Uuid;
}

/** Та же трёхветочная форма, что `TaskCommandResult`/`SectionCommandResult`
 * — см. комментарий `commands/types.ts`. `not_found` покрывает и «задача не
 * найдена/tombstone» (`createChecklistItemCommand`, задача — цель операции),
 * и «пункт не найден/tombstone» (`update`/`delete`). */
export type ChecklistItemCommandResult =
  | { readonly status: 'ok'; readonly item: ChecklistItem }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

/** Поля ChecklistItem, участвующие в per-field HLC (`entities/checklist-item.ts`)
 * — тот же приём, что `SECTION_MUTABLE_FIELDS`, диффинг через общий
 * generic-модуль `project-section-clock.ts` (переиспользован буквально, не
 * скопирован — см. комментарий там: "сама логика диффа... одинакова для
 * всех трёх сущностей"). */
export const CHECKLIST_ITEM_MUTABLE_FIELDS = ['text', 'done', 'rank', 'deletedAt'] as const;
