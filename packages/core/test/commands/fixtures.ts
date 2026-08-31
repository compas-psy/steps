import { Temporal } from '@js-temporal/polyfill';

import type { Task } from '../../src/entities/task.js';
import { initialRank } from '../../src/order/index.js';
import { asUuid, makePriority, type Uuid } from '../../src/values.js';

export const OWNER_SCOPE = asUuid('00000000-0000-0000-0000-0000000000f0');
export const DEVICE_ID = asUuid('00000000-0000-0000-0000-0000000000d1');
export const NOW = Temporal.Instant.from('2026-08-31T09:00:00Z');

export const d = (iso: string): Temporal.PlainDate => Temporal.PlainDate.from(iso);
export const t = (iso: string): Temporal.PlainTime => Temporal.PlainTime.from(iso);

/** Минимальная валидная, уже персистированная задача — фикстура для тестов
 * `update`/`complete`/`delete` (не проходит через `createTaskCommand`,
 * заводится напрямую через `InMemoryCommandStoragePort.seedTask`). */
export function existingTask(overrides: Partial<Task> = {}): Task {
  const base: Task = {
    id: asUuid('00000000-0000-0000-0000-000000000001'),
    ownerScope: OWNER_SCOPE,
    title: 'Существующая задача',
    description: '',
    priority: makePriority(4),
    rank: initialRank(),
    parentTaskId: null,
    captureState: 'processed',
    seriesId: null,
    occurrenceSeq: null,
    generatedFromOccurrenceId: null,
    projectId: null,
    sectionId: null,
    availableFrom: null,
    plannedDate: null,
    plannedTime: null,
    durationMin: null,
    focusDate: null,
    dayBucket: 'default',
    deadlineDate: null,
    deadlineTime: null,
    status: 'active',
    completedAt: null,
    completionKind: null,
    source: 'user',
    sourceChannel: null,
    sourceCaptureBatchId: null,
    sourceIntentId: null,
    originalProjectNameSnapshot: null,
    originalSectionNameSnapshot: null,
    createdAt: NOW.subtract({ hours: 1 }),
    updatedAt: NOW.subtract({ hours: 1 }),
    deletedAt: null,
    revision: 1n,
    clocks: {},
  };
  return { ...base, ...overrides } as Task;
}

export function uuid(suffix: string): Uuid {
  return asUuid(`00000000-0000-0000-0000-${suffix.padStart(12, '0')}`);
}
