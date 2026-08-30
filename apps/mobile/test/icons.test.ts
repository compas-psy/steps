/**
 * Базовый набор иконок Tauri bundle (источник для `tauri icon`/`tauri
 * android init` в CI — здесь не выполняется, нет Android SDK/NDK).
 * Полный Android adaptive-icon комплект CI строит из
 * `assets/brand/android/ic_launcher_{foreground,background,monochrome}.svg`
 * (уже готовы, замороженные — этот пакет работ их не трогает).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ICONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src-tauri/icons');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${file}: не PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('иконки Tauri mobile — настоящие изображения заявленного размера', () => {
  it.each([
    ['32x32.png', 32],
    ['128x128.png', 128],
    ['128x128@2x.png', 256],
    ['icon.png', 512],
  ] as const)('%s — %d×%d', (file, size) => {
    const { width, height } = readPngSize(path.join(ICONS_DIR, file));
    expect(width).toBe(size);
    expect(height).toBe(size);
  });
});
