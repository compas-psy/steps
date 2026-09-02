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
import type { NativeSqlBridge, StoragePort } from '@shagi/storage';
import type { PlatformCapabilitiesRegistry } from '@shagi/platform';

import { migrateIndexedDbToNative, type BackendMigrationOutcome } from './backend-migration.js';

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
    }
  | {
      /**
       * Нативная SQLite через мост оболочки (ADR-0005) — единственный
       * backend, удовлетворяющий `00§2` (WAL, внешние ключи, FTS5, файл в
       * app-private каталоге). Собирается только асинхронно
       * (`prepareStorage`): открытие базы, протокол миграций схемы и
       * одноразовый перенос из IndexedDB — всё это по природе async.
       */
      readonly kind: 'sqlite';
      readonly databaseName: string;
      /** Транспорт до нативной стороны. Даёт оболочка — `@shagi/app` не
       * знает ни про Tauri, ни про `invoke`. */
      readonly bridge: NativeSqlBridge;
      /** Имя базы IndexedDB прежних сборок — источник одноразового
       * переноса. `null`, если переносить неоткуда (например, свежая
       * платформа). */
      readonly migrateFromIndexedDb: string | null;
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
    case 'sqlite':
      // Не «пока не поддерживается» и тем более не тихий откат на
      // IndexedDB: нативный backend собирается ТОЛЬКО через
      // `prepareStorage`, и попадание сюда означает ошибку сборки
      // оболочки. Подменить нативное хранилище веб-хранилищем значило бы
      // показать человеку пустой продукт вместо его задач — ровно то, что
      // ADR-0005 запрещает.
      throw new Error(
        'resolveStorageBackend: backend "sqlite" нельзя собрать синхронно — ' +
          'оболочка обязана вызвать prepareStorage() до монтирования приложения. ' +
          'Молчаливого отката на IndexedDB здесь нет намеренно (ADR-0005).',
      );
  }
}

/** Что произошло при подготовке хранилища — оболочке нужно для диагностики,
 * а Android-смоуку — для доказательства, что backend действительно SQLite. */
export interface PreparedStorage {
  readonly storage: StoragePort;
  readonly backendKind: StorageBackend['kind'];
  /** Заполнено только для нативного backend'а. */
  readonly nativeInfo?: {
    readonly path: string;
    readonly sqliteVersion: string;
    readonly journalMode: string;
  };
  readonly migration?: BackendMigrationOutcome;
}

/**
 * Асинхронная сборка хранилища — единственный путь для нативного backend'а
 * и совместимый для остальных.
 *
 * Ни одной ветки «не получилось — возьмём другое»: провал открытия
 * нативной базы или её миграции выбрасывает исключение наружу, в оболочку.
 * Оболочка обязана показать ошибку и НЕ запускаться на подменённом
 * хранилище (ADR-0005: «если SQLite не поднялся — падать громко и
 * диагностируемо»).
 */
export async function prepareStorage(
  backend: StorageBackend,
  platform: PlatformCapabilitiesRegistry,
): Promise<PreparedStorage> {
  if (backend.kind !== 'sqlite') {
    return { storage: resolveStorageBackend(backend), backendKind: backend.kind };
  }

  // Импорт нативного пути — динамический и ТОЛЬКО в этой ветке: модуль
  // `@shagi/storage/sqlite` тянет за собой `node-sqlite-driver.ts` с
  // `import { DatabaseSync } from 'node:sqlite'`, которого в WebView не
  // существует. Статический импорт наверху файла выполнил бы этот граф в
  // браузере и уронил бы приложение до первого рендера — так уже было
  // (разбор в комментарии к точечным импортам выше).
  const { openNativeSqliteStorage } = await import('@shagi/storage/sqlite-native');
  const info = await backend.bridge.open(backend.databaseName);
  const storage = await openNativeSqliteStorage(backend.bridge, backend.databaseName);

  const migration =
    backend.migrateFromIndexedDb === null
      ? undefined
      : await migrateIndexedDbToNative({
          target: storage,
          platform,
          sourceDatabaseName: backend.migrateFromIndexedDb,
        });
  if (migration?.status === 'failed') {
    throw new Error(
      `prepareStorage: перенос данных из IndexedDB в SQLite не удался: ${migration.error}. ` +
        'Данные остались в прежней базе; запуск остановлен, чтобы не работать поверх половины.',
    );
  }

  return {
    storage,
    backendKind: 'sqlite',
    nativeInfo: {
      path: info.path,
      sqliteVersion: info.sqliteVersion,
      journalMode: info.journalMode,
    },
    ...(migration === undefined ? {} : { migration }),
  };
}
