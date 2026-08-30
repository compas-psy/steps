/**
 * Юнит-тесты мобильной оболочки. `happy-dom` — `platform.ts` читает
 * `navigator`; настоящего Android WebView здесь нет и быть не может (нет
 * Android SDK/NDK в контейнере), `@tauri-apps/plugin-deep-link` подменяется
 * через `vi.mock`.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
