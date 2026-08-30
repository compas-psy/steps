/**
 * `@shagi/i18n` — каталоги строк, ICU MessageFormat, проверка полноты
 * `ru-RU` как CI-гейт (SPEC/00 §13.1).
 *
 * Этого пакета нет в дереве §3 ТЗ — он добавлен решением из
 * `docs/adr/0004-paket-i18n.md`: ТЗ требует полноту `ru-RU` как CI-гейт,
 * но не называет, где физически живёт каталог строк. Отдельный пакет
 * не даёт продуктовым строкам просочиться в `@shagi/ui`, где им находиться
 * запрещено (см. заголовок `@shagi/ui`).
 *
 * Публичный API:
 *  - `t(namespace, key, params?, locale?)` — строка из каталога `ru-RU`,
 *    ключи типобезопасны (`catalog.ts`), плюрал — ICU (`message-format.ts`),
 *    отсутствующий ключ — `missing-key.ts` (production бросает, dev/test
 *    громко предупреждает);
 *  - `formatDate`/`formatTime`/`formatInstant`/`weekdayName`/`startOfWeek`
 *    (`format/date.ts`) — принимают `Temporal`, не `Date`;
 *  - `formatNumber` (`format/number.ts`).
 *
 * Полнота каталога проверяется статически отдельным CI-скриптом —
 * `scripts/check-i18n-catalog.mjs` в корне монорепозитория, не этим пакетом
 * во время выполнения.
 */
export const PACKAGE_NAME = '@shagi/i18n' as const;

export { t } from './translate.js';
export type { MessageParams } from './translate.js';

export { BASE_LOCALE, CATALOG_RU_RU } from './catalog.js';
export type { Namespace, KeyOf } from './catalog.js';

export { MessageFormatError, formatMessage } from './message-format.js';

export { MissingTranslationError, resolveMode } from './missing-key.js';
export type { I18nMode } from './missing-key.js';

export {
  DEFAULT_LOCALE,
  WEEKDAY_MONDAY,
  WEEKDAY_SUNDAY,
  formatDate,
  formatTime,
  formatInstant,
  weekdayName,
  startOfWeek,
} from './format/date.js';
export type { FormatDateOptions, FormatTimeOptions, FormatInstantOptions } from './format/date.js';

export { formatNumber } from './format/number.js';
export type { FormatNumberOptions } from './format/number.js';
