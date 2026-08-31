/**
 * `StorageBackend` — плоское описание того, какой адаптер `@shagi/storage`
 * использовать, а не сам сконструированный `StoragePort`.
 *
 * Причина, почему это не просто «оболочка строит `StoragePort` и кладёт в
 * `AppHost`»: `apps/web|desktop|mobile` не имеют права импортировать
 * `@shagi/storage` напрямую (`apps/web/test/architecture-boundary.test.ts`,
 * SPEC/00 §3 — «apps/* → @shagi/app → @shagi/{core,storage,...}», оболочка
 * видит только `@shagi/app`/`@shagi/platform`/`@shagi/ui`). Первая версия
 * этого пакета работ пыталась строить `IndexedDbStorage` прямо в
 * `apps/web/src/main.tsx` — гейт границы `apps/*` поймал это как обход
 * (`@shagi/storage напрямую, минуя @shagi/app`), и это находка гейта, а не
 * его помеха: конструирование конкретного адаптера — знание о домене,
 * ровно то, чему в оболочке не место.
 *
 * Поэтому оболочка передаёт только ИМЯ backend'а (данные, не поведение) —
 * `resolveStorageBackend` (эта же функция, внутри `@shagi/app`) уже решает,
 * какой адаптер `@shagi/storage` реально создать.
 */
import { createIndexedDbStorage, createInMemoryStorage, type StoragePort } from '@shagi/storage';

export type StorageBackend =
  | {
      readonly kind: 'indexeddb';
      /** Имя базы IndexedDB (`createIndexedDbStorage`, `@shagi/storage`). */
      readonly databaseName: string;
    }
  | {
      /**
       * Временная замена нативному SQLite-адаптеру, пока не поставлен
       * Tauri SQL-плагин (нет Rust-тулчейна в этом контейнере — см.
       * `.ultraplan/research/04-android-release.md`). Данные НЕ переживают
       * перезапуск оболочки — честно, не заглушка, которая делает вид, что
       * персистентность есть.
       */
      readonly kind: 'memory';
    };

/**
 * Известный, сознательно отложенный расход: импорт из общего барреля
 * `@shagi/storage` (единая точка входа пакета — граница пакетов, CLAUDE.md)
 * тянет в веб-бандл и SQLite-адаптер (`node:sqlite`), которым веб никогда
 * не пользуется, — Vite не может это вычистить сквозь `export * from`
 * (`vite build` показывает `node:sqlite has been externalized», сборка не
 * падает, но бандл ощутимо крупнее, чем был бы с точечным импортом
 * `@shagi/storage/indexeddb`). Не чиню сейчас: перф-бюджеты — отдельный
 * эпик E21 («перф-бюджеты — assertions в CI/nightly, не аспирации»,
 * `.ultraplan/plan.md`), а на этом этапе (E04, каркас, ни одного реального
 * экрана) оптимизировать бандл заранее — проектирование под гипотетическое
 * требование раньше времени. Если/когда бандл станет реальной проблемой —
 * решение: subpath-экспорты `@shagi/storage/{indexeddb,sqlite,memory}`
 * (прецедент уже есть — `./contract`, `./search-golden`) плюс `import()`
 * по имени backend'а вместо статического импорта обоих адаптеров разом.
 */
export function resolveStorageBackend(backend: StorageBackend): StoragePort {
  switch (backend.kind) {
    case 'indexeddb':
      return createIndexedDbStorage(backend.databaseName);
    case 'memory':
      return createInMemoryStorage();
  }
}
