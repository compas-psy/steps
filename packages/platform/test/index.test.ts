import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from '../src/index.js';

describe('@shagi/platform', () => {
  it('экспортирует собственное имя пакета — подтверждает, что резолвинг модулей, tsconfig и vitest настроены сквозь весь тулчейн', () => {
    expect(PACKAGE_NAME).toBe('@shagi/platform');
  });
});
