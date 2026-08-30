import { describe, expect, it } from 'vitest';

import { asUuid, isUuid, makeDurationMinutes, makePriority } from '../src/values.js';

describe('Uuid', () => {
  it('принимает синтаксически валидный UUID', () => {
    const id = asUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001');
    expect(id).toBe('018f4f2e-6e3b-7f3a-8f1a-000000000001');
  });

  it('отклоняет строку, не являющуюся UUID', () => {
    expect(() => asUuid('not-a-uuid')).toThrow();
  });

  it('isUuid — type guard, различает валидные и невалидные строки', () => {
    expect(isUuid('018f4f2e-6e3b-7f3a-8f1a-000000000001')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});

describe('makePriority', () => {
  it('принимает целые значения 1..4', () => {
    expect(makePriority(1)).toBe(1);
    expect(makePriority(4)).toBe(4);
  });

  it('отклоняет значения вне диапазона 1..4 (02§2)', () => {
    expect(() => makePriority(0)).toThrow();
    expect(() => makePriority(5)).toThrow();
  });

  it('отклоняет нецелые значения', () => {
    expect(() => makePriority(2.5)).toThrow();
  });
});

describe('makeDurationMinutes', () => {
  it('принимает целые значения 1..1440 (01§5, 02§2)', () => {
    expect(makeDurationMinutes(1)).toBe(1);
    expect(makeDurationMinutes(1440)).toBe(1440);
  });

  it('отклоняет 0 и значения больше 1440', () => {
    expect(() => makeDurationMinutes(0)).toThrow();
    expect(() => makeDurationMinutes(1441)).toThrow();
  });

  it('отклоняет нецелые значения', () => {
    expect(() => makeDurationMinutes(30.5)).toThrow();
  });
});
