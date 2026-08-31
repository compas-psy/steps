/**
 * Юнит-тесты `@shagi/app`. Раньше пакет обходился без DOM (`App` был чистой
 * функцией без хуков — см. историю `test/App.test.tsx`); с E04 появляется
 * состояние (`state/context.tsx`, React-контекст поверх `useSyncExternalStore`)
 * и реальные экраны, которые нужно рендерить — тот же выбор `happy-dom` +
 * `@testing-library/react`, что уже сделан в `packages/ui` и `apps/*`, нет
 * причины расходиться.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
