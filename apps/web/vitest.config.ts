/**
 * Юнит-тесты веб-оболочки.
 *
 * Окружение `node`: оболочка не рисует экранов (SPEC §3), а service worker
 * и подавно живёт без DOM — `test/service-worker.test.ts` поднимает
 * настоящий `public/sw.js` в подставном воркер-окружении, а не в браузере.
 * Playwright (`e2e/`) — отдельный прогон, не часть `vitest run`.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
