/**
 * `@shagi/core/order` — дробные ранги для ручного порядка (E01.2, `02§5`,
 * решение `?2`: LexoRank-подобный base62, порог ренормализации — 64
 * символа). Только чистые функции: транзакция ренормализации и её место в
 * потоке (drag-and-drop, batch sync) — эпик E02.
 *
 * Собственный барель пакета работ — сведение в общий `packages/core/src/index.ts`
 * выполняется отдельно, эта граница здесь не трогается (см. CLAUDE.md).
 */
export { initialRank, isRank, rankAfter, rankBefore, rankBetween } from './rank.js';

export {
  anyNeedsRenormalization,
  needsRenormalization,
  RANK_RENORMALIZE_THRESHOLD_LENGTH,
  renormalizeRanks,
} from './renormalize.js';
