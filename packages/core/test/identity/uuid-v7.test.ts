import { describe, expect, it } from 'vitest';

import {
  createUuidV7Generator,
  generateDeviceId,
  generateUuidV7,
} from '../../src/identity/uuid-v7.js';
import { isUuid } from '../../src/values.js';

function hexNoDashes(uuid: string): string {
  return uuid.replaceAll('-', '');
}

describe('UUIDv7 — формат (RFC 9562 §5.2)', () => {
  it('проходит общую проверку формата UUID (RFC 4122 текстовое представление)', () => {
    expect(isUuid(generateUuidV7())).toBe(true);
  });

  it('версия — "7" (13-й hex-символ)', () => {
    const hex = hexNoDashes(generateUuidV7());
    expect(hex[12]).toBe('7');
  });

  it('вариант — RFC 4122 (старшие два бита 17-го hex-символа = "10")', () => {
    const hex = hexNoDashes(generateUuidV7());
    expect(['8', '9', 'a', 'b']).toContain(hex[16]);
  });

  it('каждый вызов возвращает синтаксически валидный и уникальный UUID', () => {
    const generator = createUuidV7Generator();
    const ids = new Set(Array.from({ length: 200 }, () => generator()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(isUuid(id)).toBe(true);
    }
  });
});

describe('UUIDv7 — монотонность (задание: сортировка по времени создания используется)', () => {
  it('много вызовов подряд в пределах текущего процесса дают строго возрастающую последовательность строк', () => {
    // Без задержек между вызовами это заведомо бьёт по одной и той же
    // миллисекунде системных часов десятки/сотни раз подряд — именно тот
    // случай, который обязан оставаться строго возрастающим.
    const generator = createUuidV7Generator();
    const ids = Array.from({ length: 5000 }, () => generator());
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]! > ids[i - 1]!).toBe(true);
    }
  });

  it('строковое сравнение UUIDv7 эквивалентно сравнению по времени создания — не только "не равны"', () => {
    const generator = createUuidV7Generator();
    const first = generator();
    const second = generator();
    // Проверяем именно то свойство, ради которого монотонность нужна:
    // лексикографический порядок строк = порядок создания.
    expect(first.localeCompare(second)).toBeLessThan(0);
  });

  it('независимые генераторы не делят состояние монотонности друг с другом', () => {
    const generatorA = createUuidV7Generator();
    const generatorB = createUuidV7Generator();
    const a1 = generatorA();
    const b1 = generatorB();
    const a2 = generatorA();
    // a2 обязан быть больше a1 (монотонность генератора A), но между a1 и
    // a2 не обязано быть отношения к b1 — оба генератора работают в одной
    // и той же реальной миллисекунде независимо друг от друга.
    expect(a2 > a1).toBe(true);
    expect(isUuid(b1)).toBe(true);
  });

  it('общий процессный генератор generateUuidV7 сам по себе монотонен', () => {
    const first = generateUuidV7();
    const second = generateUuidV7();
    expect(second > first).toBe(true);
  });
});

describe('device_id — UUIDv7 (00§6)', () => {
  it('generateDeviceId — валидный UUIDv7 того же формата, что и generateUuidV7', () => {
    const deviceId = generateDeviceId();
    expect(isUuid(deviceId)).toBe(true);
    expect(hexNoDashes(deviceId)[12]).toBe('7');
  });
});
