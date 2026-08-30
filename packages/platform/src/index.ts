/**
 * `@shagi/platform` — интерфейсы возможностей платформы (SPEC/00 §4):
 * `LocalDbPort`, `FileStorePort`, `NotificationSchedulerPort` и т.д.
 *
 * Только контракты портов. Реализации живут в платформенных оболочках
 * (`apps/web|desktop|mobile`, следующий пакет работ) — так домен и UI
 * (`@shagi/core`, `@shagi/app`) остаются одинаковыми на всех платформах,
 * различаются только реализации портов. Отсутствующая на платформе
 * возможность возвращает `null`/`unsupported`, а не заглушку молча.
 */
export const PACKAGE_NAME = '@shagi/platform' as const;
