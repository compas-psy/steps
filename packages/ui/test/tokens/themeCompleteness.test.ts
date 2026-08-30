import { describe, expect, it } from 'vitest';

import { TOKENS } from '../../src/tokens/registry.js';
import { extractBlockAfter, parseDeclarations, readTokenFile } from './cssHelpers.js';

/**
 * Полнота тем (SPEC §4 — dark обязана быть отдельно посчитанной палитрой,
 * а не инверсией; §15 — WCAG/тема как release-blocker).
 *
 * Проверяет ровно то, что просит задание пакета работ: каждый токен,
 * помеченный в реестре как `themed: true` (объявлен и в light, и в dark),
 * реально имеет значение в обоих тёмных блоках `colors.css` — системном
 * (`@media (prefers-color-scheme: dark)`) и явном
 * (`[data-theme="dark"]`) — и наоборот: ни один токен, объявленный только
 * в light (`themed: false`), не просочился в тёмные блоки по ошибке.
 * Тест обязан упасть, если кто-то добавит токен только в одну тему —
 * ветки ниже покрывают оба направления этой ошибки.
 */

const colorsCss = readTokenFile('colors.css');

const lightBlock = extractBlockAfter(colorsCss, ':root {');
const darkMediaBlock = extractBlockAfter(colorsCss, '@media (prefers-color-scheme: dark) {');
const darkAttrBlock = extractBlockAfter(colorsCss, ":root[data-theme='dark']");

const lightDecls = parseDeclarations(lightBlock);
const darkMediaDecls = parseDeclarations(darkMediaBlock);
const darkAttrDecls = parseDeclarations(darkAttrBlock);

const themedNames = TOKENS.filter((t) => t.themed).map((t) => t.name.slice(2));
const invariantColorNames = TOKENS.filter(
  (t) => !t.themed && t.definedIn.endsWith('colors.css'),
).map((t) => t.name.slice(2));

describe('полнота тем: themed-токены', () => {
  it.each(themedNames)('--%s объявлен в light-блоке :root', (name) => {
    expect(lightDecls).toHaveProperty(name);
  });

  it.each(themedNames)('--%s объявлен в системном тёмном блоке (prefers-color-scheme)', (name) => {
    expect(darkMediaDecls).toHaveProperty(name);
  });

  it.each(themedNames)('--%s объявлен в явном тёмном блоке ([data-theme="dark"])', (name) => {
    expect(darkAttrDecls).toHaveProperty(name);
  });

  it('в тёмных блоках нет токенов, которых нет в реестре как themed', () => {
    const themedSet = new Set(themedNames);
    for (const name of Object.keys(darkAttrDecls)) {
      expect(
        themedSet.has(name),
        `--${name} объявлен в dark, но не помечен themed:true в реестре`,
      ).toBe(true);
    }
    for (const name of Object.keys(darkMediaDecls)) {
      expect(
        themedSet.has(name),
        `--${name} объявлен в dark, но не помечен themed:true в реестре`,
      ).toBe(true);
    }
  });
});

describe('полнота тем: оба тёмных блока работают в обе стороны одинаково', () => {
  it('system (@media prefers-color-scheme) и явный [data-theme="dark"] объявляют один и тот же набор имён', () => {
    expect(Object.keys(darkMediaDecls).toSorted()).toEqual(Object.keys(darkAttrDecls).toSorted());
  });

  it('system и явный dark дают одинаковые значения для каждого токена', () => {
    expect(darkMediaDecls).toEqual(darkAttrDecls);
  });

  it('ни один darkMedia/darkAttr токен не совпадает по значению со своим light-значением дословно (§4: отдельно посчитанная палитра, не инверсия)', () => {
    for (const name of Object.keys(darkAttrDecls)) {
      const lightValue = lightDecls[name];
      const darkValue = darkAttrDecls[name];
      expect(
        darkValue,
        `--${name}: dark (${darkValue}) не должен буквально совпадать со значением light (${lightValue})`,
      ).not.toBe(lightValue);
    }
  });
});

describe('полнота тем: инвариантные (нетематические) токены остаются вне тёмных блоков', () => {
  it.each(invariantColorNames)(
    '--%s из colors.css НЕ переопределён ни в одном тёмном блоке',
    (name) => {
      expect(darkAttrDecls).not.toHaveProperty(name);
      expect(darkMediaDecls).not.toHaveProperty(name);
    },
  );
});
