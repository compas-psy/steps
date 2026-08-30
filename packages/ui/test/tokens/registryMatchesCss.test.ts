import { describe, expect, it } from 'vitest';

import { TOKENS } from '../../src/tokens/registry.js';
import { extractAllDeclaredNames, readBundledCss, readTokenFile } from './cssHelpers.js';

/**
 * Реестр соответствует CSS: каждый токен реестра реально объявлен, каждый
 * объявленный — в реестре. Реестр — это allowlist для линтера адгезии
 * (см. `src/tokens/registry.ts`), он не имеет права расходиться с тем,
 * что на самом деле есть в CSS: ни отставать (пропущенный токен —
 * дыра в allowlist), ни опережать (несуществующий токен в реестре —
 * ложный allowlist-пункт).
 */

const bundledCss = readBundledCss();
const declaredNames = extractAllDeclaredNames(bundledCss); // без "--"
const registryNames = new Set(TOKENS.map((t) => t.name.slice(2)));

describe('реестр токенов соответствует CSS 1:1', () => {
  it('в реестре нет дублирующихся имён', () => {
    const names = TOKENS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each([...registryNames])('токен реестра --%s реально объявлен в CSS', (name) => {
    expect(declaredNames.has(name)).toBe(true);
  });

  it.each([...declaredNames])('объявленный в CSS --%s токен есть в реестре', (name) => {
    expect(registryNames.has(name)).toBe(true);
  });

  it('каждая запись реестра указывает на существующий файл в definedIn', () => {
    for (const token of TOKENS) {
      expect(token.definedIn.startsWith('src/tokens/'), token.name).toBe(true);
      const fileName = token.definedIn.slice('src/tokens/'.length);
      expect(() => readTokenFile(fileName), `${token.name} -> ${token.definedIn}`).not.toThrow();
    }
  });

  it('каждая запись реестра действительно объявлена именно в указанном ею файле', () => {
    for (const token of TOKENS) {
      const fileName = token.definedIn.slice('src/tokens/'.length);
      const fileNames = extractAllDeclaredNames(readTokenFile(fileName));
      expect(
        fileNames.has(token.name.slice(2)),
        `${token.name} not found in ${token.definedIn}`,
      ).toBe(true);
    }
  });
});
