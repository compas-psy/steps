/**
 * `tauri.conf.json` мобильной оболочки — то, что проверяемо без Android
 * SDK/NDK (валидность конфига, `identifier`, `minSdkVersion`). Реальная
 * `tauri android build` здесь не выполняется (SDK/NDK отсутствуют в
 * контейнере) — CI строит и подписывает пакет отдельно
 * (`.ultraplan/research/04-android-release.md`).
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
  version: string;
  bundle: { android?: { minSdkVersion?: number } };
}

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as TauriConfig;

describe('apps/mobile/src-tauri/tauri.conf.json', () => {
  it('identifier (applicationId) — ru.cmpas.shagi, правило СИМПАС', () => {
    // .ultraplan/research/04-android-release.md §1: applicationId не
    // переименовывается никогда — смена означает для системы ДРУГОЕ
    // приложение, обновление поверх установленного перестаёт работать.
    expect(config.identifier).toBe('ru.cmpas.shagi');
  });

  it('minSdkVersion — 26 (SPEC/00 §1.1)', () => {
    expect(config.bundle.android?.minSdkVersion).toBe(26);
  });

  it('версия в конфиге — источник истины для тега релиза (04-android-release.md §1)', () => {
    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
