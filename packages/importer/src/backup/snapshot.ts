/**
 * Снимок рабочего пространства — что именно уезжает в бэкап и что
 * приезжает обратно (`01§27`).
 *
 * Чего в снимке НЕТ и почему:
 *
 * - `syncOutbox` / `syncConflicts` — это очередь разговора С СЕРВЕРОМ
 *   конкретного устройства, а не данные человека. Восстановить её на
 *   другом устройстве значило бы отправить чужие операции от своего имени.
 * - учётные данные, идентификатор устройства, токены — `01§27` прямо:
 *   «Never include auth/device secrets».
 * - `import_batches` — служебная история импорта этого устройства; окно
 *   отката к моменту восстановления давно истекло, а «отменить импорт»,
 *   приехавший из бэкапа, удалял бы данные, которых в нём уже нет.
 */
import type {
  Attachment,
  ChecklistItem,
  Label,
  Project,
  RecurrenceSeries,
  Reminder,
  Section,
  Task,
  TaskLabel,
  TaskLink,
} from '@shagi/core';

export interface WorkspaceSnapshot {
  readonly projects: readonly Project[];
  readonly sections: readonly Section[];
  readonly tasks: readonly Task[];
  readonly labels: readonly Label[];
  readonly taskLabels: readonly TaskLabel[];
  readonly checklistItems: readonly ChecklistItem[];
  readonly reminders: readonly Reminder[];
  readonly recurrenceSeries: readonly RecurrenceSeries[];
  readonly taskLinks: readonly TaskLink[];
  readonly attachments: readonly Attachment[];
  /** Пользовательские настройки — открытая карта: набор ключей задаёт
   * оболочка (`localPreferences`), а не этот формат. */
  readonly settings: Readonly<Record<string, string>>;
}

export const EMPTY_SNAPSHOT: WorkspaceSnapshot = {
  projects: [],
  sections: [],
  tasks: [],
  labels: [],
  taskLabels: [],
  checklistItems: [],
  reminders: [],
  recurrenceSeries: [],
  taskLinks: [],
  attachments: [],
  settings: {},
};

export function isSnapshotEmpty(snapshot: WorkspaceSnapshot): boolean {
  return (
    snapshot.projects.length === 0 &&
    snapshot.sections.length === 0 &&
    snapshot.tasks.length === 0 &&
    snapshot.labels.length === 0 &&
    snapshot.recurrenceSeries.length === 0
  );
}
