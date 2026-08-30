/**
 * Иконки PWA (открытый вопрос ?30, `.ultraplan/open-questions.md`): набор
 * размеров не зафиксирован ТЗ, но раз сгенерирован — обязан быть настоящими
 * изображениями заявленного размера, а не пустышками.
 *
 * ── Дефект, который был здесь раньше ────────────────────────────────────
 *
 * `pwa-*-maskable.png` были побайтово идентичны `pwa-*-any.png`: один файл
 * под двумя именами. `purpose: "maskable"` в манифесте — обещание системе,
 * что вся смысловая часть знака помещается во вписанный круг радиусом 40%
 * стороны (W3C, safe zone: https://www.w3.org/TR/appmanifest/#dfn-safe-zone)
 * — систем вправе обрезать всё за его пределами под круг/squircle/каплю.
 * `shagi-square.svg` (источник `any`) заполняет плитку от края до края со
 * своим скруглением — под круглой маской обрежутся углы и кончики дерева.
 * Проверка на существование+размер это пропускала: файл был настоящим
 * PNG нужного размера, просто НЕ maskable по содержимому. Ниже — две новые
 * проверки, которые ловят именно это: побайтовое различие пары и реальная
 * геометрия (что лежит за пределами безопасной зоны).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { decodePng, pixelAt, type DecodedPng } from './support/png.js';

const ICONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');

const EXPECTED: Array<{ file: string; size: number }> = [
  { file: 'pwa-192-any.png', size: 192 },
  { file: 'pwa-512-any.png', size: 512 },
  { file: 'pwa-192-maskable.png', size: 192 },
  { file: 'pwa-512-maskable.png', size: 512 },
  { file: 'apple-touch-icon-180.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
  { file: 'favicon-16.png', size: 16 },
];

describe('иконки PWA — настоящие изображения заявленного размера', () => {
  for (const { file, size } of EXPECTED) {
    it(`${file} — ${size}×${size}, не пустышка`, () => {
      const png = decodePng(readFileSync(path.join(ICONS_DIR, file)));
      expect(png.width).toBe(size);
      expect(png.height).toBe(size);
    });
  }

  it('манифест ссылается ровно на эти файлы, ни одного пропущенного/лишнего', () => {
    const manifest = JSON.parse(
      readFileSync(path.resolve(ICONS_DIR, '../manifest.webmanifest'), 'utf8'),
    ) as { icons: Array<{ src: string }> };
    const referenced = manifest.icons.map((icon) => path.basename(icon.src)).toSorted();
    const generated = EXPECTED.filter((entry) => entry.file.startsWith('pwa-'))
      .map((entry) => entry.file)
      .toSorted();
    expect(referenced).toEqual(generated);
  });
});

describe('maskable-иконки — не переиспользованный any-файл под другим именем', () => {
  it.each([
    ['pwa-192-any.png', 'pwa-192-maskable.png'],
    ['pwa-512-any.png', 'pwa-512-maskable.png'],
  ])('%s и %s различаются побайтово', (anyFile, maskableFile) => {
    const anyBytes = readFileSync(path.join(ICONS_DIR, anyFile));
    const maskableBytes = readFileSync(path.join(ICONS_DIR, maskableFile));
    expect(
      anyBytes.equals(maskableBytes),
      `${anyFile} и ${maskableFile} — один и тот же файл под двумя именами`,
    ).toBe(false);
  });
});

// ── Геометрия безопасной зоны (W3C maskable icons) ─────────────────────────

/** Фирменный зелёный (`assets/brand/*.svg`, `BRAND_GREEN` в scripts/gen-icons.sh). */
const BRAND_GREEN: readonly [number, number, number] = [0x3b, 0x8f, 0x5a];
/** W3C: safe zone — вписанный круг радиусом 40% стороны от центра плитки. */
const SAFE_ZONE_RADIUS_FRACTION = 0.4;

interface SafeZoneViolation {
  readonly x: number;
  readonly y: number;
  readonly rgba: readonly [number, number, number, number];
  readonly distanceFraction: number;
}

/**
 * Ищет пиксели ЗА пределами безопасной зоны, которые не равны фону —
 * т.е. те, что система маскирования обрежет вместе со смыслом. Чистая
 * функция от уже декодированных пикселей (не от файла), поэтому её саму
 * можно проверить на синтетических примерах ниже, без перегенерации PNG.
 */
function findSafeZoneViolations(
  png: DecodedPng,
  backgroundRgb: readonly [number, number, number],
  safeRadiusFraction: number = SAFE_ZONE_RADIUS_FRACTION,
): SafeZoneViolation[] {
  const cx = (png.width - 1) / 2;
  const cy = (png.height - 1) / 2;
  const safeRadius = safeRadiusFraction * png.width;
  const violations: SafeZoneViolation[] = [];

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= safeRadius) continue;
      const rgba = pixelAt(png, x, y);
      const isBackground =
        rgba[0] === backgroundRgb[0] &&
        rgba[1] === backgroundRgb[1] &&
        rgba[2] === backgroundRgb[2] &&
        rgba[3] === 255;
      if (!isBackground) {
        violations.push({ x, y, rgba, distanceFraction: distance / png.width });
      }
    }
  }
  return violations;
}

/** Конструирует `DecodedPng` напрямую из пикселей — без файла и без PNG-кодера. */
function syntheticPng(
  size: number,
  paint: (x: number, y: number) => readonly [number, number, number, number],
): DecodedPng {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y);
      const offset = (y * size + x) * 4;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = a;
    }
  }
  return { width: size, height: size, pixels };
}

describe('findSafeZoneViolations — самопроверка: чекер действительно ловит нарушение', () => {
  it('сплошной фон без содержимого — ноль нарушений', () => {
    const png = syntheticPng(20, () => [...BRAND_GREEN, 255]);
    expect(findSafeZoneViolations(png, BRAND_GREEN)).toEqual([]);
  });

  it('пиксель другого цвета в углу (за пределами safe zone) — нарушение', () => {
    const png = syntheticPng(20, (x, y) =>
      x === 0 && y === 0 ? [255, 0, 0, 255] : [...BRAND_GREEN, 255],
    );
    const violations = findSafeZoneViolations(png, BRAND_GREEN);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.x === 0 && v.y === 0)).toBe(true);
  });

  it('тот же пиксель другого цвета у САМОГО ЦЕНТРА (внутри safe zone) — не нарушение', () => {
    const size = 20;
    const center = Math.floor(size / 2);
    const png = syntheticPng(size, (x, y) =>
      x === center && y === center ? [255, 0, 0, 255] : [...BRAND_GREEN, 255],
    );
    expect(findSafeZoneViolations(png, BRAND_GREEN)).toEqual([]);
  });

  it('воспроизводит настоящий дефект: содержимое до самых краёв (как был `any`, скопированный в `maskable`) — много нарушений', () => {
    // Имитация старого бага: неоднородный знак, залитый от края до края
    // (двух цветов чередованием), без всякого запаса до safe zone.
    const png = syntheticPng(20, (x, y) =>
      (x + y) % 3 === 0 ? [10, 10, 10, 255] : [...BRAND_GREEN, 255],
    );
    expect(findSafeZoneViolations(png, BRAND_GREEN).length).toBeGreaterThan(0);
  });
});

describe('maskable-иконки — дерево целиком внутри safe zone (W3C, радиус 40% стороны)', () => {
  it.each([
    ['pwa-192-maskable.png', 192],
    ['pwa-512-maskable.png', 512],
  ])('%s (%dpx): за пределами safe zone только фон', (file, size) => {
    const png = decodePng(readFileSync(path.join(ICONS_DIR, file)));
    expect(png.width).toBe(size);

    const violations = findSafeZoneViolations(png, BRAND_GREEN);
    if (violations.length > 0) {
      const sample = violations
        .slice(0, 5)
        .map(
          (v) =>
            `(${v.x},${v.y}) rgba=${v.rgba.join(',')} на ${(v.distanceFraction * 100).toFixed(1)}% стороны от центра`,
        )
        .join('; ');
      expect.fail(
        `${file}: ${violations.length} пикселей за пределами safe zone не равны фону — знак обрежется системной маской. Пример: ${sample}`,
      );
    }
  });

  it.each([['pwa-192-maskable.png'], ['pwa-512-maskable.png']])(
    '%s: знак реально нарисован (внутри safe zone есть не-фоновые пиксели)',
    (file) => {
      const png = decodePng(readFileSync(path.join(ICONS_DIR, file)));
      const cx = (png.width - 1) / 2;
      const cy = (png.height - 1) / 2;
      const safeRadius = SAFE_ZONE_RADIUS_FRACTION * png.width;

      let inkPixels = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          if (Math.hypot(x - cx, y - cy) > safeRadius) continue;
          const [r, g, b] = pixelAt(png, x, y);
          if (r !== BRAND_GREEN[0] || g !== BRAND_GREEN[1] || b !== BRAND_GREEN[2]) inkPixels++;
        }
      }
      expect(
        inkPixels,
        `${file}: внутри safe zone нет ни одного пикселя знака — похоже на пустой фон`,
      ).toBeGreaterThan(0);
    },
  );
});
