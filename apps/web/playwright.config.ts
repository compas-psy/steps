/**
 * Playwright-смоук веб-оболочки. Chromium уже установлен в контейнере
 * (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, ревизия 1194) —
 * `playwright install` не запускается ни здесь, ни в CI-профиле этого
 * пакета работ. `@playwright/test` в `package.json` поэтому закреплён на
 * `1.56.0` буквально (не `^`): это последняя версия пакета, которая всё
 * ещё ищет ровно ревизию 1194 браузера — более новые (1.57+) требуют более
 * новую ревизию и падают на `Executable doesn't exist`.
 *
 * `webServer` поднимает `vite preview` поверх собранного `dist/` — смоук
 * проверяет ту же сборку, что уедет в продакшн, а не dev-сервер с HMR.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  webServer: {
    command: 'pnpm exec vite preview --port 4319 --strictPort',
    port: 4319,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4319',
  },
});
