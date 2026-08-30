import { Temporal } from '@js-temporal/polyfill';

import type { Uuid } from './values.js';

/**
 * Hybrid Logical Clock — значение и порядок (`00§6`: "per-field Hybrid
 * Logical Clock (HLC) для sync merge"; `02§8` merge-правила используют
 * сравнение HLC напрямую: "relation exists when add_hlc > remove_hlc").
 *
 * Домен владеет значением и его сравнением, потому что бизнес-правила вроде
 * OR-set меток (`TaskLabel`) зависят от порядка HLC уже здесь — это не
 * деталь транспорта. Протокол назначения HLC при записи, допуск clock skew
 * (решение `?11`: ±24ч) и merge/outbox поверх этого значения — владение
 * `@shagi/sync` (см. его `package.json`).
 */
export interface Hlc {
  readonly physical: Temporal.Instant;
  readonly logical: number;
  /** Тай-брейк при полном совпадении physical+logical. `null`, если
   * устройство неизвестно/не нужно (единственный источник записи). */
  readonly deviceId: Uuid | null;
}

/**
 * Полный порядок на HLC: physical, затем logical, затем deviceId.
 * @returns отрицательное число, если `a` раньше `b`; положительное — если
 * позже; `0` при полном равенстве.
 */
export function compareHlc(a: Hlc, b: Hlc): number {
  const byPhysical = Temporal.Instant.compare(a.physical, b.physical);
  if (byPhysical !== 0) {
    return byPhysical;
  }

  if (a.logical !== b.logical) {
    return a.logical - b.logical;
  }

  return compareDeviceId(a.deviceId, b.deviceId);
}

function compareDeviceId(a: Uuid | null, b: Uuid | null): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `a` строго новее `b` — ровно то отношение, которым `02§8` определяет
 * членство в OR-set (`add_hlc > remove_hlc`). */
export function isHlcAfter(a: Hlc, b: Hlc): boolean {
  return compareHlc(a, b) > 0;
}
