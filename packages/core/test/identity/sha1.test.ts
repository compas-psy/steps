import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sha1 } from '../../src/identity/internal/sha1.js';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * `sha1.ts` не использует `node:crypto` (нужна портируемость в браузер —
 * см. комментарий в исходнике), но тест вправе использовать его как
 * независимый эталон: если наша чистая реализация разойдётся с системной,
 * тест обязан упасть.
 */
function nodeSha1Hex(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

describe('sha1 (RFC 3174)', () => {
  it('совпадает с официальным тестовым вектором RFC 3174 — "abc"', () => {
    expect(hex(sha1(encode('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('совпадает с официальным тестовым вектором RFC 3174 — пустая строка', () => {
    expect(hex(sha1(encode('')))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('совпадает с официальным тестовым вектором RFC 3174 — 56-байтная строка', () => {
    const message = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    expect(hex(sha1(encode(message)))).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1');
  });

  it('совпадает с node:crypto на произвольных строках, включая длинные (проверка паддинга)', () => {
    const samples = [
      'ШАГИ',
      'a'.repeat(55), // граница паддинга: 55 байт + 0x80 ровно укладывается в один 64-байтный блок
      'a'.repeat(56), // 56 байт уже не укладывается — нужен второй блок
      'a'.repeat(64), // ровно один полный блок без остатка
      'a'.repeat(1000),
    ];
    for (const sample of samples) {
      expect(hex(sha1(encode(sample)))).toBe(nodeSha1Hex(sample));
    }
  });
});
