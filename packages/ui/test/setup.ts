/**
 * Общий setup для vitest этого пакета (`vitest.config.ts` → `setupFiles`).
 *
 * `@testing-library/jest-dom/vitest` — не общий root-экспорт пакета:
 * vitest-специфичный сабпаз одновременно (1) регистрирует матчеры в
 * рантайме через `expect` из `vitest` (`expect.extend`) и (2) расширяет
 * тип `Assertion` модуля `vitest` (`declare module 'vitest'`) — так
 * `toBeDisabled()`/`toHaveAccessibleName()` и т.п. видны и в рантайме, и
 * `tsc`, без отдельного `.d.ts` с ручной аугментацией.
 */
import '@testing-library/jest-dom/vitest';
