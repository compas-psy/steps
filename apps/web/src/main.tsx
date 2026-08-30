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
// Единственная точка подключения токенов дизайн-системы (SPEC §4 «оболочка
// … подключает токены из packages/ui»). Сами компоненты — E03, экраны — E04.
// eslint-disable-next-line import/no-unassigned-import -- CSS-побочный эффект, не значение
import '@shagi/ui/tokens.css';

import { createWebPlatform } from './platform.js';
import { registerServiceWorker } from './pwa.js';

const host: AppHost = {
  platform: createWebPlatform(),
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка оболочки повреждена');

registerServiceWorker();

createRoot(container).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
