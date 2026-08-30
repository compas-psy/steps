/**
 * `@shagi/sync` — outbox/inbox, per-field Hybrid Logical Clock и merge
 * (SPEC/00 §6, §7).
 *
 * Outbox пишется в той же локальной транзакции, что и сущность (план
 * волны, раздел «Что закладывается с первого коммита») — это гарантирует
 * `packages/storage`, а не сам `sync`. В волне 1 (этот пакет работ) здесь
 * закладывается только форма данных outbox/inbox-записи; протокол
 * применения и merge — пакеты работ волны 2.
 */
export const PACKAGE_NAME = '@shagi/sync' as const;
