/**
 * Общий setup для vitest этого пакета (`vitest.config.ts` → `setupFiles`).
 * Тот же приём, что `packages/ui/test/setup.ts` — vitest-специфичный
 * сабпаз `@testing-library/jest-dom/vitest` регистрирует матчеры и
 * расширяет тип `Assertion`, отдельный `.d.ts` не нужен.
 */
import '@testing-library/jest-dom/vitest';
