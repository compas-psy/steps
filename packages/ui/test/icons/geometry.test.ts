import { describe, expect, it } from 'vitest';

import { ICON_DEFINITIONS } from '../../src/icons/contours.js';
import type { IconPrimitive } from '../../src/icons/types.js';

/**
 * Единство набора — не только формальные правила языка (viewBox/stroke/
 * currentColor, см. `visualLanguage.test.ts`), но и одна оптическая
 * плотность: контур, случайно вылезший за пределы холста 24×24 (опечатка
 * в координате), сразу ломает «собранные в одну строку иконки выглядят
 * одним набором» — эта проверка ловит такую опечатку механически, глаз
 * всё равно нужен для остального (см. отчёт по заданию).
 */
const MIN = -0.5;
const MAX = 24.5;

function expectInBounds(value: number, where: string) {
  expect(value, where).toBeGreaterThanOrEqual(MIN);
  expect(value, where).toBeLessThanOrEqual(MAX);
}

function pointsFromAttr(points: string, where: string) {
  const numbers = points
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  expect(numbers.length % 2, `${where}: нечётное число координат в points`).toBe(0);
  for (const n of numbers) {
    expect(Number.isFinite(n), where).toBe(true);
  }
  return numbers;
}

describe.each(ICON_DEFINITIONS)(
  'иконка "$name" — контур в границах холста 24×24',
  ({ name, primitives }) => {
    it('все явные координаты примитивов (circle/line/rect/polyline/polygon) внутри [-0.5, 24.5]', () => {
      // Приведение к `IconPrimitive`: после `as const satisfies` в
      // contours.ts каждый примитив несёт свой узкий литеральный тип без
      // опциональных полей, которых нет буквально в исходнике (см.
      // комментарий у ICON_REGISTRY) — `el.transform` ниже не существует
      // на части этих литералов формально, хотя рантайм-значение то же.
      const typedPrimitives = primitives as readonly IconPrimitive[];
      for (const [i, el] of typedPrimitives.entries()) {
        const where = `${name}[${i}] (${el.tag})`;
        switch (el.tag) {
          case 'circle':
            expectInBounds(el.cx - el.r, `${where}.cx-r`);
            expectInBounds(el.cx + el.r, `${where}.cx+r`);
            expectInBounds(el.cy - el.r, `${where}.cy-r`);
            expectInBounds(el.cy + el.r, `${where}.cy+r`);
            break;
          case 'line':
            expectInBounds(el.x1, `${where}.x1`);
            expectInBounds(el.y1, `${where}.y1`);
            expectInBounds(el.x2, `${where}.x2`);
            expectInBounds(el.y2, `${where}.y2`);
            break;
          case 'rect':
            // Повёрнутые (transform="rotate(...)") прямоугольники после
            // поворота могут формально выйти за исходные x/y/width/height
            // без нарушения холста — сама точка поворота внутри контура,
            // а поворот на 45° капсулы `link` — единственный случай в
            // наборе (см. комментарий в contours.ts).
            if (el.transform === undefined) {
              expectInBounds(el.x, `${where}.x`);
              expectInBounds(el.y, `${where}.y`);
              expectInBounds(el.x + el.width, `${where}.x+width`);
              expectInBounds(el.y + el.height, `${where}.y+height`);
            }
            break;
          case 'polyline':
          case 'polygon':
            pointsFromAttr(el.points, where).forEach((n) => expectInBounds(n, where));
            break;
          case 'path':
            // d-строки (кривые/дуги) не парсятся геометрически — числа в
            // них всё равно проверяются на разумный диапазон ниже.
            break;
        }
      }
    });

    it('числа в path d не улетают далеко за пределы холста (грубая защита от опечатки)', () => {
      // Числа в `d` бывают относительными смещениями (`l -9 9`, `a2 2 0 0
      // 1-2-2`), не только абсолютными координатами — легитимная дельта
      // на холсте 24×24 не превышает по модулю 24. Диапазон шире этого,
      // чтобы не дёргаться на легитимные дельты, но всё ещё ловит
      // реальный класс опечатки: пропущенный пробел склеивает два числа
      // в один трёх-четырёхзначный «мусор» (напр. `12 14` → `1214`).
      for (const [i, el] of primitives.entries()) {
        if (el.tag !== 'path') continue;
        const numbers = el.d.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
        for (const n of numbers) {
          expect(n, `${name}[${i}].d содержит подозрительное число ${n}`).toBeGreaterThanOrEqual(
            -24,
          );
          expect(n, `${name}[${i}].d содержит подозрительное число ${n}`).toBeLessThanOrEqual(30);
        }
      }
    });
  },
);
