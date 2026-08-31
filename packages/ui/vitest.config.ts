/**
 * Юнит-тесты `@shagi/ui`. `happy-dom` — тот же выбор, что уже сделан в
 * `apps/{web,desktop,mobile}` (см. их `vitest.config.ts`) — нет причины
 * расходиться (задание E03.1).
 *
 * `globals: true` — стандартная связка vitest + `@testing-library/react`:
 * авто-cleanup после каждого теста (`@testing-library/react/dist/index.js`
 * проверяет `typeof afterEach === 'function'` именно как ГЛОБАЛЬНУЮ
 * ссылку) без него не срабатывает, и DOM между тестами одного файла не
 * чистится. Остальные пакеты монорепо `globals` не используют — область
 * действия этой настройки ограничена этим файлом, соседей не касается.
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
