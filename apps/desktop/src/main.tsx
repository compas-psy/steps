/**
 * Точка входа десктопной оболочки ШАГОВ.
 *
 * Ни одного экрана (SPEC §3) — только сборка `AppHost` из платформенных
 * портов десктопа и монтирование `<App/>` из `@shagi/app`.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, type AppHost } from '@shagi/app';
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
//
// `@shagi/app` сама решает, какой адаптер `@shagi/storage` строить —
// оболочке запрещено видеть этот пакет напрямую (SPEC §3,
// `apps/web/test/architecture-boundary.test.ts` сканирует все три оболочки
// одним и тем же правилом).
const host: AppHost = {
  platform: createDesktopPlatform(),
  storageBackend: {
    kind: 'sqlite',
    databaseName: 'shagi.db',
    bridge: createNativeSqlBridge(),
    migrateFromIndexedDb: null,
  },
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка оболочки повреждена');

createRoot(container).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
