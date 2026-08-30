import type { Temporal } from '@js-temporal/polyfill';

import type { Uuid } from '../values.js';

export type AttachmentState = 'local_pending' | 'uploading' | 'synced' | 'failed' | 'deleted';

/** `attachments` (`02§2`, `01§1`, `01§24`). Лимит 10/задачу — §2 п.21,
 * забота валидатора. `localUri`/`objectKey` независимы от `state` в типе:
 * какая комбинация ожидается на каждой стадии загрузки — забота команд
 * `FileStorePort`/sync (следующие пакеты работ), не этого типа. */
export interface Attachment {
  readonly id: Uuid;
  readonly taskId: Uuid;
  readonly displayName: string;
  readonly mime: string;
  readonly size: number;
  readonly sha256: string;
  readonly localUri: string | null;
  readonly objectKey: string | null;
  readonly state: AttachmentState;
  readonly createdAt: Temporal.Instant;
  readonly updatedAt: Temporal.Instant;
}
