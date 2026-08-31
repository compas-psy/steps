import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `00§5`: нативный `Date` запрещён в доменной логике — только `Temporal`.
 * Зеркалит `packages/core/test/no-native-date.test.ts` (тот же приём: скан
 * исходников, не правило линтера — см. его комментарий для полного
 * обоснования, здесь не дублируется).
 */
function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('запрет нативного Date в packages/storage/src (SPEC/00 §5)', () => {
  const offendingPatterns = [/\bnew Date\(/, /\bDate\.now\(/];

  it('ни один файл src не содержит `new Date(` или `Date.now(`', () => {
    const files = listSourceFiles(new URL('../src', import.meta.url).pathname);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of offendingPatterns) {
        if (pattern.test(content)) {
          offenders.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(offenders, `найден нативный Date:\n${offenders.join('\n')}`).toEqual([]);
  });
});
