/**
 * Точка входа веб-оболочки ШАГОВ.
 *
 * Ни одного экрана, ни одной кнопки — так и должно быть (SPEC §3). Файл
 * делает три вещи: собирает `AppHost` из платформенных портов веба,
 * монтирует `<App/>` из `@shagi/app` и включает PWA-обвязку (регистрация
 * service worker'а — `pwa.ts`).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, type AppHost } from '@shagi/app';
// Единственная точка подключения токенов и стилей компонентов
// дизайн-системы (SPEC §4 «оболочка … подключает токены из packages/ui»).
// eslint-disable-next-line import/no-unassigned-import -- CSS-побочный эффект, не значение
import '@shagi/ui/tokens.css';
// eslint-disable-next-line import/no-unassigned-import -- CSS-побочный эффект, не значение
import '@shagi/ui/components.css';

import { createWebPlatform } from './platform.js';
import { registerServiceWorker } from './pwa.js';

// `storageBackend` — только описание («используй IndexedDB, вот имя базы»),
// не сам адаптер: оболочке запрещено импортировать `@shagi/storage`
// напрямую (`apps/web/test/architecture-boundary.test.ts`, SPEC §3) —
// `@shagi/app` строит реальный `StoragePort` сама (`resolveStorageBackend`).
// Одна база на профиль браузера — имя стабильно, миграции внутри
// `createIndexedDbStorage` сами доводят схему до `DATABASE_VERSION`.
const host: AppHost = {
  platform: createWebPlatform(),
  storageBackend: { kind: 'indexeddb', databaseName: 'shagi' },
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка оболочки повреждена');

registerServiceWorker();

createRoot(container).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
