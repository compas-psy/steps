import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Рекурсивно собирает пути ко всем `.ts`-файлам под `dir`.
 *
 * Внутренний helper, не часть публичного API пакета — используется тестом
 * запрета нативного `Date` (`test/no-native-date.test.ts`), поэтому живёт
 * в `internal/`, а не экспортируется из `src/index.ts`.
 */
export function listSourceFiles(dir: string): string[] {
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
