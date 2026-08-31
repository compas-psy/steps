import type { Temporal } from '@js-temporal/polyfill';

import type { Section } from '../entities/section.js';
import type { SyncOutboxEntry } from '../entities/sync-outbox.js';
import type { ValidationResult } from '../validation/types.js';
import type { Uuid } from '../values.js';
import type { NonEmptyArray } from './storage-port.js';

/**
 * Порт хранения командного слоя Section — тот же приём, что
 * `project-port.ts` (ADR-0003). `CommandSectionReader` — структурный срез
 * `SectionRepository` (`packages/storage/src/ports/section-repository.ts`):
 * `findById` для `updateSectionCommand` (сырое чтение, tombstone
 * включительно), `listByProject` для reorder-соседей и для
 * `archiveProjectCommand`/permanent-delete (`project-archive.ts`/
 * `project-delete.ts`, обход всех секций проекта — см. комментарий
 * `CommandProjectTaskReader` в `project-port.ts`).
 */
export interface CommandSectionReader {
  findById(id: Uuid): Promise<Section | null>;
  listByProject(projectId: Uuid): Promise<readonly Section[]>;
}

export interface CommandSectionEntityWrite {
  readonly entity: 'section';
  readonly value: Section;
}

export interface CommandSectionDomainMutation {
  readonly writes: readonly CommandSectionEntityWrite[];
  readonly outbox: NonEmptyArray<SyncOutboxEntry>;
}

export interface CommandSectionWriteTransaction {
  applyMutation(mutation: CommandSectionDomainMutation): Promise<void>;
}

export interface CommandSectionStoragePort {
  readonly sections: CommandSectionReader;
  runTransaction<T>(run: (tx: CommandSectionWriteTransaction) => Promise<T>): Promise<T>;
}

export interface SectionCommandDeps {
  readonly storage: CommandSectionStoragePort;
  readonly now: Temporal.Instant;
  readonly deviceId: Uuid;
  readonly generateId?: () => Uuid;
  readonly generateOpId?: () => Uuid;
}

/** Та же трёхветочная форма, что `ProjectCommandResult` (`project-port.ts`)
 * — см. комментарий там. */
export type SectionCommandResult =
  | { readonly status: 'ok'; readonly section: Section }
  | { readonly status: 'rejected'; readonly validation: ValidationResult }
  | { readonly status: 'not_found' };

/** Поля Section, участвующие в per-field HLC (`entities/section.ts`) — у
 * Section нет `createdAt`/`updatedAt`/`revision` вовсе (в отличие от Task
 * и даже Project), только `title`/`rank`/`deletedAt` изменяемы. */
export const SECTION_MUTABLE_FIELDS = ['title', 'rank', 'deletedAt'] as const;
