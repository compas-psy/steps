/**
 * Иконки Tauri bundle (открытый вопрос ?30): настоящие изображения
 * заявленного размера, не пустышки. `icon.ico` проверяется отдельно —
 * ICO хранит несколько изображений в одном файле, PNG-парсер здесь не
 * подходит.
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

describe('иконки Tauri desktop — настоящие изображения заявленного размера', () => {
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

  it('icon.ico существует, содержит несколько размеров и не пуст', () => {
    const buffer = readFileSync(path.join(ICONS_DIR, 'icon.ico'));
    // ICO-заголовок: reserved=0 (2 байта), type=1 (2 байта), count (2 байта).
    expect(buffer.readUInt16LE(0)).toBe(0);
    expect(buffer.readUInt16LE(2)).toBe(1);
    const count = buffer.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(4);
  });
});
