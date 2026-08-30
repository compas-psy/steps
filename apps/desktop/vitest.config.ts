/**
 * Юнит-тесты десктопной оболочки. `happy-dom`: `platform.ts` читает
 * `navigator.onLine`/`window` — реального Tauri-рантайма здесь нет и не
 * будет (нет системных webkit-библиотек в этом контейнере), поэтому
 * `@tauri-apps/plugin-*` подменяются в тестах через `vi.mock`.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
