/**
 * `@shagi/contracts` — DTO и Zod-схемы, совместимые с OpenAPI 3.1
 * (SPEC/00 §3, §14).
 *
 * Единственное место, где описывается ФОРМА данных, которой обмениваются
 * `core`, `storage`, `sync` и `server/` — сам протокол (какое поле кто и
 * когда меняет) живёт в `packages/sync` и `packages/core`, а не здесь.
 * Пакет не содержит бизнес-правил и не знает про SQLite/IndexedDB/HTTP —
 * только типы и схемы валидации формы.
 */
export const PACKAGE_NAME = '@shagi/contracts' as const;
