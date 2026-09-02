/**
 * Восстановление из бэкапа ШАГОВ — `01§27`, дословно два режима:
 *
 *   1. «Restore into empty workspace — preserve original IDs/full graph.»
 *   2. «Import into non-empty workspace — colliding IDs are remapped
 *      consistently across the whole imported graph; never overwrite
 *      silently.»
 *
 * Ключевое слово во втором режиме — CONSISTENTLY. Если задаче выдан новый
 * id, то и её `parentTaskId` у детей, и `taskId` у пунктов чек-листа,
 * напоминаний, связей и меток обязаны указывать на ТОТ ЖЕ новый id.
 * Поэтому перенумерация живёт в одной чистой функции, которая сначала
 * строит ПОЛНУЮ карту «старый id → новый id», а потом переписывает по ней
 * КАЖДУЮ ссылку графа. Разложить это по местам применения — верный способ
 * забыть одну ссылку и получить бэкап, который восстанавливается наполовину.
 *
 * «never overwrite silently» реализовано буквально: столкновение id — это
 * ВСЕГДА новая сущность с новым id, существующая не трогается ни при каких
 * условиях.
 */
import { generateUuidV7, type Uuid } from '@shagi/core';

import type { WorkspaceSnapshot } from './snapshot.js';

export type RestoreMode = 'preserve_ids' | 'remap_collisions';

export interface RestorePlan {
  readonly mode: RestoreMode;
  readonly snapshot: WorkspaceSnapshot;
  /** Старый id → новый. Пусто, если ничего не перенумеровано. */
  readonly remapped: ReadonlyMap<Uuid, Uuid>;
}

/** Все id, которые уже заняты в целевом пространстве. */
export interface ExistingIds {
  readonly projects: ReadonlySet<Uuid>;
  readonly sections: ReadonlySet<Uuid>;
  readonly tasks: ReadonlySet<Uuid>;
  readonly labels: ReadonlySet<Uuid>;
  readonly checklistItems: ReadonlySet<Uuid>;
  readonly reminders: ReadonlySet<Uuid>;
  readonly recurrenceSeries: ReadonlySet<Uuid>;
}

export const NO_EXISTING_IDS: ExistingIds = {
  projects: new Set(),
  sections: new Set(),
  tasks: new Set(),
  labels: new Set(),
  checklistItems: new Set(),
  reminders: new Set(),
  recurrenceSeries: new Set(),
};

function remapId(
  id: Uuid,
  taken: ReadonlySet<Uuid>,
  into: Map<Uuid, Uuid>,
  generateId: () => Uuid,
): void {
  if (!taken.has(id) || into.has(id)) return;
  into.set(id, generateId());
}

function mapped(map: ReadonlyMap<Uuid, Uuid>, id: Uuid): Uuid;
function mapped(map: ReadonlyMap<Uuid, Uuid>, id: Uuid | null): Uuid | null;
function mapped(map: ReadonlyMap<Uuid, Uuid>, id: Uuid | null): Uuid | null {
  if (id === null) return null;
  return map.get(id) ?? id;
}

export interface PlanRestoreOptions {
  readonly existing: ExistingIds;
  readonly generateId?: () => Uuid;
}

export function planRestore(snapshot: WorkspaceSnapshot, options: PlanRestoreOptions): RestorePlan {
  const generateId = options.generateId ?? generateUuidV7;
  const remap = new Map<Uuid, Uuid>();

  // Шаг 1: полная карта столкновений — ДО единой правки ссылок.
  for (const project of snapshot.projects) {
    remapId(project.id, options.existing.projects, remap, generateId);
  }
  for (const section of snapshot.sections) {
    remapId(section.id, options.existing.sections, remap, generateId);
  }
  for (const task of snapshot.tasks) remapId(task.id, options.existing.tasks, remap, generateId);
  for (const label of snapshot.labels)
    remapId(label.id, options.existing.labels, remap, generateId);
  for (const item of snapshot.checklistItems) {
    remapId(item.id, options.existing.checklistItems, remap, generateId);
  }
  for (const reminder of snapshot.reminders) {
    remapId(reminder.id, options.existing.reminders, remap, generateId);
  }
  for (const series of snapshot.recurrenceSeries) {
    remapId(series.id, options.existing.recurrenceSeries, remap, generateId);
  }

  if (remap.size === 0) {
    return { mode: 'preserve_ids', snapshot, remapped: remap };
  }

  // Шаг 2: переписываются ВСЕ ссылки графа по одной карте.
  const rewritten: WorkspaceSnapshot = {
    projects: snapshot.projects.map((project) => ({ ...project, id: mapped(remap, project.id) })),
    sections: snapshot.sections.map((section) => ({
      ...section,
      id: mapped(remap, section.id),
      projectId: mapped(remap, section.projectId),
    })),
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      id: mapped(remap, task.id),
      projectId: mapped(remap, task.projectId),
      sectionId: mapped(remap, task.sectionId),
      parentTaskId: mapped(remap, task.parentTaskId),
      seriesId: mapped(remap, task.seriesId),
      generatedFromOccurrenceId: mapped(remap, task.generatedFromOccurrenceId),
    })) as WorkspaceSnapshot['tasks'],
    labels: snapshot.labels.map((label) => ({ ...label, id: mapped(remap, label.id) })),
    taskLabels: snapshot.taskLabels.map((link) => ({
      ...link,
      taskId: mapped(remap, link.taskId),
      labelId: mapped(remap, link.labelId),
    })),
    checklistItems: snapshot.checklistItems.map((item) => ({
      ...item,
      id: mapped(remap, item.id),
      taskId: mapped(remap, item.taskId),
    })),
    reminders: snapshot.reminders.map((reminder) => ({
      ...reminder,
      id: mapped(remap, reminder.id),
      taskId: mapped(remap, reminder.taskId),
    })),
    // У серии нет ссылки на задачу — связь односторонняя, `Task.seriesId`
    // (`entities/recurrence-series.ts`), и она уже переписана выше.
    recurrenceSeries: snapshot.recurrenceSeries.map((series) => ({
      ...series,
      id: mapped(remap, series.id),
    })),
    taskLinks: snapshot.taskLinks.map((link) => ({
      ...link,
      id: mapped(remap, link.id),
      taskId: mapped(remap, link.taskId),
    })),
    attachments: snapshot.attachments.map((attachment) => ({
      ...attachment,
      id: mapped(remap, attachment.id),
      taskId: mapped(remap, attachment.taskId),
    })),
    settings: snapshot.settings,
  };

  return { mode: 'remap_collisions', snapshot: rewritten, remapped: remap };
}
