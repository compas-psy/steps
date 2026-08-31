/**
 * Playwright — a11y (axe) и визрегрессия каталога-харнесса `@shagi/ui`
 * (E03 «харнесс a11y и визрегрессии», `docs/spec/SPEC/06_TESTING_ACCEPTANCE.md`
 * §7, `00_MASTER_IMPLEMENTATION_TZ.md` — «Playwright — Web E2E + visual
 * regression»). Chromium уже установлен в контейнере
 * (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, ревизия 1194) — тот же
 * контракт версии, что `apps/web/playwright.config.ts` уже объясняет
 * (`@playwright/test@1.56.0` буквально, не `^`, `playwright install` не
 * запускается).
 *
 * `webServer` — `vite build && vite preview`, не голый `vite` (dev-сервер) и
 * не голый `vite preview` без предшествующего build (как у `apps/web`, где
 * сборку делает отдельный шаг CI перед e2e, `.github/workflows/ci.yml`,
 * шаг 7). У `packages/ui` такого отдельного шага в CI ещё нет — этот пакет
 * работ его не заводит (вне территории задания), поэтому `webServer.command`
 * должен быть самодостаточным: команда из задания оркестратора
 * (`pnpm --filter @shagi/ui exec playwright test`) обязана поднять
 * актуальный харнесс сама, без напоминания собрать его отдельно. `preview`
 * поверх собранного `dist/` (`vite.config.ts`) также даёт менее шумный DOM, чем dev-режим
 * (без HMR-клиента и его WebSocket) — важно для визрегрессии, где лишний
 * недетерминированный узел в дереве рискует испортить скриншот.
 *
 * Порт `4321` — не пересекается с `apps/web` (`4319`), оба пакета могут
 * гонять e2e параллельно на одной машине.
 *
 * `viewport` шире дефолта Playwright (`1440×960`, не `1280×720`) — часть
 * оверлеев харнесса (`CommandPalette`) считает свою ширину как
 * `min(560px, 100vw - 32px)`: на слишком узком вьюпорте `100vw` сжало бы
 * панель уже, чем рассчитан пример, и увеличило бы шанс визуального
 * расхождения между прогонами из-за скролл-полос браузера.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  fullyParallel: true,
  reporter: process.env['CI'] ? [['list']] : [['list']],
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 4321 --strictPort',
    port: 4321,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4321',
    viewport: { width: 1440, height: 960 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
