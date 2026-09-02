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
 *
 * `--host 127.0.0.1` обязателен, и вот почему. По умолчанию `vite preview`
 * слушает `localhost`, а это ИМЯ, а не адрес: на раннере GitHub Actions оно
 * разрешается сначала в `::1`, и сервер оказывается доступен только по
 * IPv6. Playwright же ходит по `baseURL`, где записан `127.0.0.1`, —
 * и получает `ERR_CONNECTION_REFUSED` во всех четырёх тестах, хотя сервер
 * поднялся и проверка готовности порта прошла. Локально этого не видно:
 * там `localhost` разрешается в `127.0.0.1` первым, и смоук зелёный —
 * из-за чего гейт CI был красным на КАЖДОМ коммите проекта, а причина
 * выглядела как «тесты падают», а не как «сервер не на том стеке».
 * Явный адрес снимает расхождение целиком.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 4319 --strictPort',
    port: 4319,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4319',
  },
});
