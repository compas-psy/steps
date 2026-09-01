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
import { createIndexedDbStorage } from '@shagi/storage/indexeddb';
import { createInMemoryStorage } from '@shagi/storage/memory';
import type { StoragePort } from '@shagi/storage';

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
 * Точечные импорты `@shagi/storage/{indexeddb,memory}` — НЕ из общего
 * барреля пакета. Это не перф-оптимизация впрок, а обход настоящего
 * краша: общий баррель (`@shagi/storage/index.ts`) реэкспортирует и
 * SQLite-адаптер (`./sqlite/index.ts` → `node-sqlite-driver.ts` →
 * `import { DatabaseSync } from 'node:sqlite'`), а ES-модуль при импорте
 * ЛЮБОГО именованного экспорта выполняется целиком — `vite build`
 * это молча толерирует («node:sqlite has been externalized», сборка не
 * падает, бандл просто крупнее), но `vite dev`/`vite preview` реально
 * ВЫПОЛНЯЮТ этот граф модулей в браузере: `import { DatabaseSync } from
 * 'node:sqlite'` на верхнем уровне `node-sqlite-driver.ts` бросает
 * необработанное исключение немедленно при загрузке `#root` — экран
 * гарантированно пустой, ни один экран продукта не рендерится, никаким
 * ScreenId. Найдено вручную (`pnpm --filter @shagi/web dev` + браузер) —
 * ни `vite build`, ни модульные тесты этого не ловят, оба минуют реальный
 * ESM-граф в браузере. `type StoragePort` — отдельным `import type` из
 * главного барреля: TypeScript стирает такой импорт целиком на этапе
 * компиляции, ни один байт `node:sqlite` в рантайм не попадает.
 */
export function resolveStorageBackend(backend: StorageBackend): StoragePort {
  switch (backend.kind) {
    case 'indexeddb':
      return createIndexedDbStorage(backend.databaseName);
    case 'memory':
      return createInMemoryStorage();
  }
}
