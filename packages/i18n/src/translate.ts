/**
 * `t()` — единственная точка чтения строк из каталога.
 *
 * Типобезопасность ключей: `namespace`/`key` типизированы через `Namespace`/
 * `KeyOf<N>` из `catalog.ts`, выведенные из самого JSON — обращение к
 * несуществующему ключу не компилируется (см. `test/type-safety.test.ts`,
 * где это доказывается через `@ts-expect-error`).
 *
 * Поведение на отсутствие ключа в рантайме (динамический ключ, который
 * статика `scripts/check-i18n-catalog.mjs` не поймала) — `missing-key.ts`:
 * production бросает, dev/test громко предупреждает и возвращает маркер.
 */
import { CATALOG_RU_RU, BASE_LOCALE, type Namespace, type KeyOf } from './catalog.js';
import {
  parseMessage,
  renderNodes,
  type MessageNode,
  type MessageParams,
} from './message-format.js';
import { reportMissingKey } from './missing-key.js';

export type { MessageParams } from './message-format.js';

const parseCache = new Map<string, readonly MessageNode[]>();

function getParsed(source: string): readonly MessageNode[] {
  let parsed = parseCache.get(source);
  if (!parsed) {
    parsed = parseMessage(source);
    parseCache.set(source, parsed);
  }
  return parsed;
}

/**
 * Возвращает строку `namespace.key` каталога `ru-RU`, подставляя `params`
 * (в т.ч. плюрал через ICU `{count, plural, …}` — см. `message-format.ts`).
 *
 * `locale` пока не варьируется (R1 — только `ru-RU`), но принимается явно,
 * а не жёстко "зашит" внутрь: будущая локаль (SPEC §13.1 — «допускать
 * будущие локали без форка компонентов») подключается сменой источника
 * каталога и этого аргумента, не переписыванием сигнатуры `t()`.
 */
export function t<N extends Namespace>(
  namespace: N,
  key: KeyOf<N>,
  params?: MessageParams,
  locale: string = BASE_LOCALE,
): string {
  const namespaceCatalog = CATALOG_RU_RU[namespace] as Record<string, string>;
  const source = namespaceCatalog[key as string];
  if (typeof source !== 'string') {
    return reportMissingKey(String(namespace), String(key));
  }
  return renderNodes(getParsed(source), params, locale, undefined);
}
