/**
 * `@shagi/ui` — токены и generic-компоненты дизайн-системы.
 *
 * `packages/ui` не содержит продуктовых строк: ни одной русской
 * (или любой другой) буквы пользовательского текста — только токены,
 * примитивы (Button, Input, Card, Badge, ...) и их пропсы. Экраны,
 * бизнес-копирайт и маршрутизация — это `@shagi/app`. Адгезия дизайн-
 * системы (запрет сырых hex/px и произвольных font-family) проверяется
 * этим пакетом через `.oxlintrc.json` — см. комментарий там.
 *
 * Слой токенов (E00.2): CSS живёт в `src/tokens/*.css`, единая точка
 * входа для потребителей — публичный subpath-экспорт пакета
 * `@shagi/ui/tokens.css` (= `src/tokens/index.css`, импортирует всё
 * остальное). Компоненты, которые появятся в E03, подключают этот файл
 * один раз и обращаются к переменным через `var(--...)`.
 */
export const PACKAGE_NAME = '@shagi/ui' as const;

export type { TokenDescriptor, TokenKind } from './tokens/registry.js';
export { TOKENS } from './tokens/registry.js';

export type { Breakpoint } from './tokens/breakpoints.js';
export { BREAKPOINTS, breakpointForWidth } from './tokens/breakpoints.js';

export type { Rgb } from './tokens/contrast.js';
export {
  contrastRatio,
  hexToRgb,
  relativeLuminance,
  WCAG_AA_LARGE_TEXT,
  WCAG_AA_NORMAL_TEXT,
} from './tokens/contrast.js';

export type { ThirdPartyNotice } from './fonts/notices.js';
export { FONT_THIRD_PARTY_NOTICES } from './fonts/notices.js';
