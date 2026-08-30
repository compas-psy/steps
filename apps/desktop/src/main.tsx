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

const host: AppHost = {
  platform: createDesktopPlatform(),
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка оболочки повреждена');

createRoot(container).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
