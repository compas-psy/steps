import { Temporal } from '@js-temporal/polyfill';

import type { NowContext } from '../src/types.js';

export function now(date: string, time: string): NowContext {
  return {
    date: Temporal.PlainDate.from(date),
    time: Temporal.PlainTime.from(time),
    timeZone: 'Europe/Moscow',
  };
}

/** Понедельник, для сценариев, где день недели важен, но не является сутью
 * теста. */
export const MONDAY = now('2026-08-31', '10:00');
