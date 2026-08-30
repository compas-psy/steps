import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FONT_THIRD_PARTY_NOTICES } from '../../src/fonts/notices.js';
import { extractUrls, readTokenFile } from './cssHelpers.js';

/**
 * Self-host шрифтов (SPEC §2): файлы `.woff2` физически лежат в
 * `src/fonts/`, а не тянутся из сети — здесь проверяется, что каждый
 * `url(...)` из `fonts.css` резолвится в реально существующий,
 * валидный `.woff2`-файл (magic-bytes `wOF2`), и что уведомление о
 * лицензии для экрана «О приложении / Лицензии» на месте.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..', '..', 'src');
const TOKENS_DIR = join(SRC_DIR, 'tokens');
const FONTS_DIR = join(SRC_DIR, 'fonts');

const fontsCss = readTokenFile('fonts.css');
const fontUrls = extractUrls(fontsCss);

const WOFF2_MAGIC = [0x77, 0x4f, 0x46, 0x32]; // 'wOF2'

describe('self-hosted шрифты', () => {
  it('fonts.css объявляет ровно 7 @font-face (Geist 400/500/600/700 + Geist Mono 400/500/600)', () => {
    const faceCount = (fontsCss.match(/@font-face/g) ?? []).length;
    expect(faceCount).toBe(7);
  });

  it.each(fontUrls)('файл %s существует и является валидным woff2', (relativeUrl) => {
    const absolutePath = join(TOKENS_DIR, relativeUrl);
    const bytes = readFileSync(absolutePath);
    expect(bytes.length).toBeGreaterThan(0);
    expect([...bytes.subarray(0, 4)]).toEqual(WOFF2_MAGIC);
  });

  it('ровно 4 файла Geist Sans и 3 файла Geist Mono объявлены', () => {
    const sansCount = fontUrls.filter((u) => u.includes('geist-sans')).length;
    const monoCount = fontUrls.filter((u) => u.includes('geist-mono')).length;
    expect(sansCount).toBe(4);
    expect(monoCount).toBe(3);
  });

  it('каждый font-weight в fonts.css — одно из объявленных в typography.css (fw-*) начертаний', () => {
    const weights = [...fontsCss.matchAll(/font-weight:\s*(\d+);/g)].map((m) => Number(m[1]));
    const typographyCss = readTokenFile('typography.css');
    const allowedWeights = [...typographyCss.matchAll(/--fw-[a-z]+:\s*(\d+);/g)].map((m) =>
      Number(m[1]),
    );
    for (const w of weights) {
      expect(allowedWeights).toContain(w);
    }
  });
});

describe('уведомление о лицензии шрифта — для экрана «О приложении / Лицензии»', () => {
  it('FONT_THIRD_PARTY_NOTICES содержит запись про Geist с SIL OFL', () => {
    expect(FONT_THIRD_PARTY_NOTICES.length).toBeGreaterThan(0);
    const geistNotice = FONT_THIRD_PARTY_NOTICES.find((n) => n.name.includes('Geist'));
    expect(geistNotice).toBeDefined();
    expect(geistNotice?.licenseSpdxId).toBe('OFL-1.1');
    expect(geistNotice?.licenseText.length).toBeGreaterThan(500);
    expect(geistNotice?.licenseText).toContain('SIL OPEN FONT LICENSE');
  });

  it('каждый файл, перечисленный в уведомлении, реально существует', () => {
    for (const notice of FONT_THIRD_PARTY_NOTICES) {
      for (const relativeFile of notice.files) {
        // notice.files — пути относительно src/ (напр. 'fonts/geist-sans/...'),
        // см. src/fonts/notices.ts.
        const absolutePath = join(SRC_DIR, relativeFile);
        expect(() => readFileSync(absolutePath), relativeFile).not.toThrow();
      }
    }
  });

  it('файл лицензии дублируется на диске (для инструментов, сканирующих LICENSE-файлы)', () => {
    const licenseText = readFileSync(join(FONTS_DIR, 'licenses', 'geist-OFL.txt'), 'utf8');
    expect(licenseText).toContain('SIL OPEN FONT LICENSE');
  });
});
