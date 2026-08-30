/**
 * `@shagi/core/identity` — идентификаторы домена (E01.2, `00§6`).
 *
 * UUIDv7 — для всех пользовательских сущностей и `device_id`: генерируется
 * локально, монотонен по времени создания в пределах процесса. UUIDv5 —
 * единственное исключение (`00§6`), только для occurrence/subtask/checklist
 * повторов серии (`02§13`): детерминированность нужна, чтобы два офлайн-
 * устройства, независимо завершившие один и тот же occurrence, сошлись на
 * одном и том же id следующего графа без ручного merge.
 *
 * Собственный барель пакета работ — сведение в общий `packages/core/src/index.ts`
 * выполняется отдельно, эта граница здесь не трогается (см. CLAUDE.md).
 */
export { createUuidV7Generator, generateDeviceId, generateUuidV7 } from './uuid-v7.js';

export { deriveChecklistItemId, deriveOccurrenceId, deriveSubtaskId, uuidV5 } from './uuid-v5.js';
