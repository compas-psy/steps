/**
 * Точка входа мобильной оболочки ШАГОВ.
 *
 * Ни одного экрана (SPEC §3) — только сборка `AppHost` из платформенных
 * портов Android, подготовка хранилища и монтирование `<App/>` из
 * `@shagi/app`.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, prepareStorage, type AppHost, type StorageBackend } from '@shagi/app';
// eslint-disable-next-line import/no-unassigned-import -- CSS-побочный эффект, не значение
import '@shagi/ui/tokens.css';

import { createMobilePlatform } from './platform.js';
import { createNativeSqlBridge } from './sqlite-bridge.js';

/**
 * Нативная SQLite (ADR-0005) — целевой backend Android: WAL, внешние
 * ключи, FTS5, файл в app-private каталоге (`00§2`). До этого пакета работ
 * оболочка работала на IndexedDB (ADR-0006, временное решение с записанным
 * условием закрытия R1).
 *
 * `migrateFromIndexedDb: 'shagi'` — имя базы прежних сборок. Установки с
 * ней существуют, и просто переключить backend значило бы, что у человека
 * при обновлении «исчезли» все задачи. Перенос одноразовый, условия и
 * разбор — в `@shagi/app` `state/backend-migration.ts`.
 *
 * `@shagi/app` сама решает, какой адаптер `@shagi/storage` строить —
 * оболочке запрещено видеть этот пакет напрямую (SPEC §3,
 * `apps/web/test/architecture-boundary.test.ts` сканирует все три
 * оболочки одним и тем же правилом).
 */
const storageBackend: StorageBackend = {
  kind: 'sqlite',
  databaseName: 'shagi.db',
  bridge: createNativeSqlBridge(),
  migrateFromIndexedDb: 'shagi',
};

const host: AppHost = {
  platform: createMobilePlatform(),
  storageBackend,
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка оболочки повреждена');

/**
 * Провал подготовки хранилища НЕ откатывается на другой backend: подменить
 * нативную базу веб-хранилищем значит показать человеку пустой продукт
 * вместо его задач (ADR-0005). Вместо этого — видимое сообщение с текстом
 * ошибки, по которому поломку можно диагностировать, и никакого
 * приложения поверх сломанного хранилища.
 */
function renderStorageFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const box = document.createElement('pre');
  box.dataset.shagiStorageError = 'true';
  box.style.cssText = 'padding:24px;white-space:pre-wrap;font:14px/1.5 monospace';
  box.textContent = `Хранилище не открылось.\n\n${message}`;
  container?.replaceChildren(box);
}

void prepareStorage(storageBackend, host.platform)
  .then((prepared) => {
    createRoot(container).render(
      <StrictMode>
        <App host={host} storage={prepared.storage} />
      </StrictMode>,
    );
    // Диагностика для дымового теста и разбора поломок: по этим полям
    // видно, что backend действительно нативный, а не подменённый.
    Object.assign(globalThis as Record<string, unknown>, {
      __shagiStorage: {
        backend: prepared.backendKind,
        native: prepared.nativeInfo,
        migration: prepared.migration,
      },
    });
  })
  .catch((error: unknown) => {
    renderStorageFailure(error);
  });
