/**
 * Точка входа мобильной оболочки ШАГОВ.
 *
 * Ни одного экрана (SPEC §3) — только сборка `AppHost` из платформенных
 * портов Android и монтирование `<App/>` из `@shagi/app`.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, type AppHost } from '@shagi/app';
// eslint-disable-next-line import/no-unassigned-import -- CSS-побочный эффект, не значение
import '@shagi/ui/tokens.css';

import { createMobilePlatform } from './platform.js';

// `storageBackend: { kind: 'memory' }` — временно, пока не поставлен
// Tauri SQL-плагин (нет Rust-тулчейна в среде разработки этого пакета
// работ — `.ultraplan/research/04-android-release.md`). Честно: данные НЕ
// переживают перезапуск оболочки, это не притворство, что персистентность
// уже есть. `@shagi/app` сама решает, какой адаптер `@shagi/storage`
// строить — оболочке запрещено видеть этот пакет напрямую (SPEC §3,
// `apps/web/test/architecture-boundary.test.ts` сканирует все три
// оболочки одним и тем же правилом).
const host: AppHost = {
  platform: createMobilePlatform(),
  storageBackend: { kind: 'memory' },
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка оболочки повреждена');

createRoot(container).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
