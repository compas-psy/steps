/**
 * Поведение на отсутствующий ключ каталога (SPEC/00 §13.1: «Missing Russian
 * key/fallback-to-key in production build is a CI failure»).
 *
 * Основной гейт — статический: `scripts/check-i18n-catalog.mjs` не даёт
 * такому коду доехать до продакшн-сборки (см. заголовок скрипта). Этот
 * модуль — второй, рантайм-рубеж на случай, если ключ всё же собран
 * динамически (`t(ns, computedKey)`) и статический анализ его не увидел:
 *
 *  - **production** — бросает `MissingTranslationError`. Тихая подстановка
 *    имени ключа в интерфейс здесь недопустима буквально по формулировке
 *    ТЗ, поэтому это осознанно жёстко: пусть упадёт функция/экран, а не
 *    молча покажет пользователю "task.postponeConfirm".
 *  - **development / test** — не роняет процесс (сломанный экран за
 *    каждым отсутствующим переводом плохо совместим с итеративной
 *    разработкой), но громко пишет в консоль и возвращает маркер вида
 *    `⟦missing: ns.key⟧`, который невозможно принять за настоящий текст —
 *    в отличие от голого имени ключа, который на экране легко спутать с
 *    осознанно техническим лейблом и не заметить регрессию.
 *
 * Режим определяется `SHAGI_I18N_MODE` (явный оверрайд — используют тесты
 * этого пакета) и иначе `NODE_ENV`. Неизвестное/отсутствующее окружение
 * трактуется как production — так же, как fail-closed политика сборки
 * Android без секретов (`.ultraplan/open-questions.md` →26): молчаливый
 * дефолт в сторону «мягче» был бы тем самым тихим фолбэком, который и
 * запрещает ТЗ.
 */

export class MissingTranslationError extends Error {
  constructor(namespace: string, key: string) {
    super(`[@shagi/i18n] отсутствует строка «${namespace}.${key}» в каталоге ru-RU`);
    this.name = 'MissingTranslationError';
  }
}

export type I18nMode = 'production' | 'development';

const SOFT_ENV_VALUES = new Set(['development', 'test']);

function readEnv(name: string): string | undefined {
  if (typeof process === 'undefined' || typeof process.env !== 'object' || process.env === null) {
    return undefined;
  }
  return process.env[name];
}

export function resolveMode(): I18nMode {
  const override = readEnv('SHAGI_I18N_MODE');
  if (override === 'production' || override === 'development') return override;
  const nodeEnv = readEnv('NODE_ENV');
  return nodeEnv !== undefined && SOFT_ENV_VALUES.has(nodeEnv) ? 'development' : 'production';
}

/** Строгий гейт (SPEC §16.1): всегда бросает, независимо от режима — для мест, где мягкого пути нет. */
export function assertKeyExists(namespace: string, key: string): never {
  throw new MissingTranslationError(namespace, key);
}

/** Мягкий путь для рантайм-вызова `t()`: production бросает, dev/test — заметный маркер + console.error. */
export function reportMissingKey(namespace: string, key: string): string {
  const error = new MissingTranslationError(namespace, key);
  if (resolveMode() === 'production') {
    throw error;
  }
  // eslint-disable-next-line no-console -- сознательный шум разработки, не прод-путь
  console.error(error.message);
  return `⟦missing: ${namespace}.${key}⟧`;
}
