/**
 * `tauri.conf.json` — то, что реально проверяемо в этом контейнере без
 * системных webkit-библиотек (нет `cargo build`, но JSON — обычный файл).
 * Минимальный размер окна ~980×640 — `04_UI_DESIGN_SYSTEM.md` §8: «Native
 * window minimum ~980×640; smaller switches compact/single-pane instead of
 * clipping» — ниже оболочка обязана переключиться в одноколоночный режим
 * (когда экраны появятся, E04), а не обрезать контент.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src-tauri/tauri.conf.json',
);

interface TauriConfig {
  identifier: string;
  app: {
    windows: Array<{ minWidth?: number; minHeight?: number; width?: number; height?: number }>;
  };
  bundle: { android?: { minSdkVersion?: number } };
}

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as TauriConfig;

describe('apps/desktop/src-tauri/tauri.conf.json', () => {
  it('identifier — ru.cmpas.shagi (правило СИМПАС, .ultraplan/research/04-android-release.md)', () => {
    expect(config.identifier).toBe('ru.cmpas.shagi');
  });

  it('минимальный размер окна не ниже 980×640 (SPEC/04 §8)', () => {
    const main = config.app.windows[0];
    expect(main?.minWidth, 'minWidth не задан').toBeDefined();
    expect(main?.minHeight, 'minHeight не задан').toBeDefined();
    expect(main?.minWidth ?? 0).toBeGreaterThanOrEqual(980);
    expect(main?.minHeight ?? 0).toBeGreaterThanOrEqual(640);
  });

  it('стартовый размер окна не меньше минимального', () => {
    const main = config.app.windows[0];
    expect(main?.width ?? 0).toBeGreaterThanOrEqual(main?.minWidth ?? 0);
    expect(main?.height ?? 0).toBeGreaterThanOrEqual(main?.minHeight ?? 0);
  });
});
