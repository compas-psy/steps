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

// `indexeddb` — промежуточное хранилище Android-оболочки до SQLite-плагина
// (ADR-0006; целевое решение — ADR-0005). Раньше здесь была память, то есть
// задачи не переживали закрытие приложения ВООБЩЕ. Работает это потому, что
// на Android Tauri отдаёт страницу с origin `http://tauri.localhost`
// (`tauri-2.11.5/src/manager/mod.rs`, ветка `target_os = "android"`), а не
// с `file://` — то есть обычный HTTP-origin, где IndexedDB доступна и живёт
// в приватном каталоге приложения. Проверяется не на веру: дымовой тест на
// эмуляторе (`scripts/android-smoke.mjs`) создаёт задачу, гасит процесс
// `am force-stop` и открывает приложение заново.
//
// Имя базы — то же `shagi`, что у веба: это одно и то же логическое
// хранилище одного продукта, а origin у оболочек всё равно разный, пересечься
// им негде.
//
// `@shagi/app` сама решает, какой адаптер `@shagi/storage` строить —
// оболочке запрещено видеть этот пакет напрямую (SPEC §3,
// `apps/web/test/architecture-boundary.test.ts` сканирует все три
// оболочки одним и тем же правилом).
const host: AppHost = {
  platform: createMobilePlatform(),
  storageBackend: { kind: 'indexeddb', databaseName: 'shagi' },
};

const container = document.getElementById('root');
if (!container) throw new Error('Не найден #root: разметка оболочки повреждена');

createRoot(container).render(
  <StrictMode>
    <App host={host} />
  </StrictMode>,
);
