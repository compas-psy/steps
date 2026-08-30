import { Temporal } from '@js-temporal/polyfill';

import { asUuid, type Uuid } from '../values.js';

/**
 * UUIDv7 (RFC 9562 §5.2) для локально генерируемых доменных id и
 * `device_id` (`00§6`). Раскладка 128 бит: 48 бит unix-времени в мс, 4 бита
 * версии (`0111`), 12 бит случайности (`rand_a`), 2 бита варианта (`10`),
 * 62 бита случайности (`rand_b`).
 *
 * Требование задания: сортировка по времени создания используется — значит
 * два вызова в пределах одной миллисекунды обязаны дать СТРОГО возрастающие
 * значения, а не совпадающие или, тем более, невозрастающие (иначе порядок
 * создания теряется). Наивная "время + случайность на каждый вызов" этого
 * не гарантирует: `Temporal.Now.instant()` даёт то же самое `ms`, если
 * системные часы не продвинулись, а случайная часть с равной вероятностью
 * может выйти меньше предыдущей. Поэтому генератор хранит состояние
 * (последние `ms` и `rand`) и при совпадении миллисекунды не перегенерирует
 * случайность, а увеличивает её на 1 (RFC 9562 §6.2, "Monotonic Random") —
 * переполнение 74-битного счётчика в пределах одной мс практически
 * недостижимо при обычной частоте вызовов, но на этот случай `ms`
 * искусственно сдвигается на 1 вперёд, чтобы монотонность не сломалась.
 */

const RAND_BITS = 74n; // 12 (rand_a) + 62 (rand_b)
const RAND_MAX = (1n << RAND_BITS) - 1n;
const MS_MASK = (1n << 48n) - 1n;

function randomBits74(): bigint {
  // 80 бит случайности с запасом — берём младшие 74 через маску ниже.
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value & RAND_MAX;
}

function formatUuidV7(msValue: bigint, rand: bigint): Uuid {
  const randA = (rand >> 62n) & 0xfffn; // старшие 12 бит randA
  const randB = rand & ((1n << 62n) - 1n); // младшие 62 бита randB
  const value =
    ((msValue & MS_MASK) << 80n) | (0b0111n << 76n) | (randA << 64n) | (0b10n << 62n) | randB;
  const hex = value.toString(16).padStart(32, '0');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  return asUuid(uuid);
}

interface MonotonicState {
  readonly ms: bigint;
  readonly rand: bigint;
}

/**
 * Создаёт независимый генератор UUIDv7 со своим состоянием монотонности —
 * для изоляции в тестах (или нескольких независимых потоков id в одном
 * процессе). Для обычного использования достаточно {@link generateUuidV7}.
 */
export function createUuidV7Generator(): () => Uuid {
  let state: MonotonicState | null = null;

  return function generateUuidV7(): Uuid {
    const nowMs = BigInt(Temporal.Now.instant().epochMilliseconds);
    let ms = nowMs;
    let rand: bigint;

    if (state !== null && ms <= state.ms) {
      ms = state.ms;
      rand = state.rand + 1n;
      if (rand > RAND_MAX) {
        ms += 1n;
        rand = randomBits74();
      }
    } else {
      rand = randomBits74();
    }

    state = { ms, rand };
    return formatUuidV7(ms, rand);
  };
}

/** Общий генератор UUIDv7 на процесс — монотонен сам по себе (см. выше). */
export const generateUuidV7: () => Uuid = createUuidV7Generator();

/**
 * `device_id` (`00§6`) — UUIDv7, создаётся один раз при первой установке и
 * затем хранится персистентно (хранение — вне этого пакета, `packages/storage`).
 * Именованный алиас `generateUuidV7` для читаемости на месте вызова.
 */
export const generateDeviceId: () => Uuid = generateUuidV7;
