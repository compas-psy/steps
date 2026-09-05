/**
 * Точка входа десктопной оболочки ШАГОВ.
 *
 * Ни одного экрана (SPEC §3) — только сборка `AppHost` из платформенных
 * портов десктопа, подготовка нативного хранилища и монтирование `<App/>`
 * из `@shagi/app`.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, prepareStorage, type AppHost, type StorageBackend } from '@shagi/app';
// eslint-disable-next-line import/no-unassigned-import -- CSS-побочный эффект, не значение
import '@shagi/ui/tokens.css';

import { createDesktopPlatform } from './platform.js';
import { createNativeSqlBridge } from './sqlite-bridge.js';

// Нативная SQLite, тот же общий крейт `shagi-sqlite`, что у Android
// (ADR-0005). До профиля `MVP 1.0-local` (ADR-0009) здесь стоял
// `kind: 'memory'`, и данные не переживали перезапуск оболочки — для
// local-first продукта это не «временное упрощение», а отсутствие продукта
// на этой платформе.
//
// `migrateFromIndexedDb: null` — в отличие от Android: у десктопной
// оболочки никогда не было релиза на IndexedDB, переносить нечего. Поле
// обязательное и не имеет умолчания намеренно: «мигрировать неоткуда» —
// это решение оболочки, и оно должно быть написано, а не подразумеваться.
const storageBackend: StorageBackend = {
  kind: 'sqlite',
  databaseName: 'shagi.db',
  bridge: createNativeSqlBridge(),
  migrateFromIndexedDb: null,
};

// `@shagi/app` сама решает, какой адаптер `@shagi/storage` строить —
// оболочке запрещено видеть этот пакет напрямую (SPEC §3,
// `apps/web/test/architecture-boundary.test.ts` сканирует все три оболочки
// одним и тем же правилом).
const host: AppHost = {
  platform: createDesktopPlatform(),
  storageBackend,
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка оболочки повреждена');

/**
 * Провал подготовки хранилища НЕ откатывается на другой backend: подменить
 * нативную базу веб-хранилищем значит показать человеку пустой продукт
 * вместо его задач (ADR-0005). Вместо этого — видимое сообщение с текстом
 * ошибки, и никакого приложения поверх сломанного хранилища.
 */
function renderStorageFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const box = document.createElement('pre');
  box.dataset.shagiStorageError = 'true';
  box.style.cssText = 'padding:24px;white-space:pre-wrap;font:14px/1.5 monospace';
  box.textContent = `Хранилище не открылось.\n\n${message}`;
  container?.replaceChildren(box);
}

/**
 * `prepareStorage` ОБЯЗАТЕЛЕН для нативного backend'а и не является
 * оптимизацией: `resolveStorageBackend` на `kind: 'sqlite'` бросает
 * намеренно («оболочка обязана вызвать prepareStorage() до монтирования»,
 * ADR-0005) — открытие базы, миграции схемы и перенос по природе async.
 *
 * Первая версия этой оболочки передавала `storageBackend` прямо в `<App/>`
 * без подготовки. Приложение при этом ЗАПУСКАЛОСЬ: WebView2 создавал
 * полноценный профиль, Windows не записывала ни одного отчёта о падении, —
 * но React падал на первом же рендере, окно оставалось пустым, и база не
 * создавалась никогда. Поймано install-смоуком на раннере (`c782a82`),
 * потому что он проверяет ФАЙЛ БАЗЫ, а не факт запуска окна.
 */
void prepareStorage(storageBackend, host.platform)
  .then((prepared) => {
    createRoot(container).render(
      <StrictMode>
        <App host={host} storage={prepared.storage} />
      </StrictMode>,
    );
    // Диагностика для смоука и разбора поломок: по этим полям видно, что
    // backend действительно нативный, а не подменённый.
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
