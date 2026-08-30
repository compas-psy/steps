import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, it } from 'vitest';

import { compareHlc, isHlcAfter, type Hlc } from '../src/hlc.js';
import { asUuid } from '../src/values.js';

const deviceA = asUuid('018f4f2e-6e3b-7f3a-8f1a-0000000000a0');
const deviceB = asUuid('018f4f2e-6e3b-7f3a-8f1a-0000000000b0');

function hlc(physicalIso: string, logical: number, deviceId: Hlc['deviceId'] = null): Hlc {
  return { physical: Temporal.Instant.from(physicalIso), logical, deviceId };
}

describe('compareHlc — Hybrid Logical Clock (`00§6`, `02§6`)', () => {
  it('более поздний physical компонент побеждает', () => {
    const older = hlc('2026-08-30T10:00:00Z', 5);
    const newer = hlc('2026-08-30T10:00:01Z', 0);
    expect(compareHlc(newer, older)).toBeGreaterThan(0);
  });

  it('при равном physical сравнение переходит на logical', () => {
    const lower = hlc('2026-08-30T10:00:00Z', 1);
    const higher = hlc('2026-08-30T10:00:00Z', 2);
    expect(compareHlc(higher, lower)).toBeGreaterThan(0);
  });

  it('при равных physical и logical тай-брейк по deviceId (детерминированный порядок)', () => {
    const a = hlc('2026-08-30T10:00:00Z', 1, deviceA);
    const b = hlc('2026-08-30T10:00:00Z', 1, deviceB);
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, a)).toBeGreaterThan(0);
  });

  it('полностью равные HLC сравниваются как 0', () => {
    const a = hlc('2026-08-30T10:00:00Z', 1, deviceA);
    const b = hlc('2026-08-30T10:00:00Z', 1, deviceA);
    expect(compareHlc(a, b)).toBe(0);
  });
});

describe('isHlcAfter', () => {
  it('true, когда первый строго новее второго', () => {
    const older = hlc('2026-08-30T10:00:00Z', 0);
    const newer = hlc('2026-08-30T10:00:05Z', 0);
    expect(isHlcAfter(newer, older)).toBe(true);
    expect(isHlcAfter(older, newer)).toBe(false);
  });

  it('false при полном равенстве (строгое "после", не "не раньше")', () => {
    const a = hlc('2026-08-30T10:00:00Z', 0);
    const b = hlc('2026-08-30T10:00:00Z', 0);
    expect(isHlcAfter(a, b)).toBe(false);
  });
});
