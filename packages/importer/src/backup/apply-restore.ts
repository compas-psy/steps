/**
 * Запись восстановленного графа в хранилище.
 *
 * Пишет через обычный `applyMutation` — то есть С outbox-записями, как
 * любая пользовательская команда. Это осознанно: восстановление из бэкапа
 * — действие человека над СВОИМИ данными на этом устройстве, и будущий
 * сервер обязан увидеть его так же, как увидел бы ручное создание тех же
 * задач. Обходной путь «записать мимо outbox» существует ровно один
 * (`eraseAllLocalData`) и оправдан прямым запретом `05§13` смешивать
 * локальное удаление с удалением аккаунта; у восстановления такого запрета
 * нет, и заводить второй обход было бы решением без основания.
 *
 * Одна транзакция на всё: наполовину восстановленный граф — это порванные
 * ссылки (подзадача без родителя, задача без проекта), то есть состояние
 * хуже, чем «восстановление не удалось».
 */
import { generateUuidV7, type SyncOutboxEntry, type Uuid } from '@shagi/core';
import type { EntityWrite, StoragePort } from '@shagi/storage';
import type { Temporal } from '@js-temporal/polyfill';

import type { WorkspaceSnapshot } from './snapshot.js';

export interface ApplyRestoreDeps {
  readonly storage: StoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateOpId?: () => Uuid;
}

export interface RestoreSummary {
  readonly projects: number;
  readonly sections: number;
  readonly tasks: number;
  readonly labels: number;
  readonly checklistItems: number;
  readonly reminders: number;
  readonly recurrenceSeries: number;
}

export async function applyRestore(
  snapshot: WorkspaceSnapshot,
  deps: ApplyRestoreDeps,
): Promise<RestoreSummary> {
  const generateOpId = deps.generateOpId ?? generateUuidV7;
  const writes: EntityWrite[] = [
    // Порядок — от независимых к зависимым: проект раньше раздела, раздел
    // раньше задачи, задача раньше её пунктов. Внутри одной транзакции
    // это не обязательно для целостности, но сохраняет осмысленный
    // порядок в журнале outbox для будущего сервера.
    ...snapshot.projects.map((value) => ({ entity: 'project' as const, value })),
    ...snapshot.sections.map((value) => ({ entity: 'section' as const, value })),
    ...snapshot.labels.map((value) => ({ entity: 'label' as const, value })),
    ...snapshot.recurrenceSeries.map((value) => ({ entity: 'recurrence_series' as const, value })),
    // Родители раньше детей — по той же причине, что и в импорте.
    ...snapshot.tasks
      .filter((task) => task.parentTaskId === null)
      .map((value) => ({ entity: 'task' as const, value })),
    ...snapshot.tasks
      .filter((task) => task.parentTaskId !== null)
      .map((value) => ({ entity: 'task' as const, value })),
    ...snapshot.taskLabels.map((value) => ({ entity: 'task_label' as const, value })),
    ...snapshot.checklistItems.map((value) => ({ entity: 'checklist_item' as const, value })),
    ...snapshot.reminders.map((value) => ({ entity: 'reminder' as const, value })),
    ...snapshot.taskLinks.map((value) => ({ entity: 'task_link' as const, value })),
    ...snapshot.attachments.map((value) => ({ entity: 'attachment' as const, value })),
  ];

  if (writes.length > 0) {
    const outbox: SyncOutboxEntry[] = writes.map((write) => ({
      opId: generateOpId(),
      deviceId: deps.deviceId,
      entityType: write.entity,
      entityId: entityIdOf(write),
      patchJson: { restored: true },
      fieldClocksJson: {},
      // У Task есть `revision`, у остальных сущностей нет; для записи
      // журнала важно лишь, от какого состояния отсчитывается патч, а
      // восстановление отсчитывается от «ничего» — 0n.
      baseRevision: 0n,
      createdAt: deps.now,
      retryCount: 0,
    }));
    await deps.storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes,
        outbox: outbox as unknown as Parameters<typeof tx.applyMutation>[0]['outbox'],
      });
    });
  }

  return {
    projects: snapshot.projects.length,
    sections: snapshot.sections.length,
    tasks: snapshot.tasks.length,
    labels: snapshot.labels.length,
    checklistItems: snapshot.checklistItems.length,
    reminders: snapshot.reminders.length,
    recurrenceSeries: snapshot.recurrenceSeries.length,
  };
}

/** У связей `task_label` нет собственного `id` — первичный ключ составной
 * (`02§2`), и в журнале адресуется задача. */
function entityIdOf(write: EntityWrite): Uuid {
  return write.entity === 'task_label' ? write.value.taskId : write.value.id;
}
