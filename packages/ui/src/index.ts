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
 * остальное). Компоненты (E03.1) подключают этот файл один раз и
 * обращаются к переменным через `var(--...)`; их собственные стили живут
 * рядом в `src/components/*.css` и собираются в `@shagi/ui/components.css`
 * тем же приёмом.
 *
 * Набор иконок (E03.0) живёт в `src/icons/` как framework-agnostic данные
 * (`IconDefinition[]`) — здесь он реэкспортирован вместе с React-обёрткой
 * `Icon` (`src/components/Icon.tsx`), которая одна умеет превращать
 * `IconPrimitive` в JSX; остальные компоненты пакета идут через неё же.
 */
export const PACKAGE_NAME = '@shagi/ui' as const;

export type { IconDefinition, IconName, IconPrimitive } from './icons/index.js';
export {
  ICON_DEFAULT_SIZE,
  ICON_DEFINITIONS,
  ICON_NAMES,
  ICON_REGISTRY,
  ICON_STROKE_LINECAP,
  ICON_STROKE_LINEJOIN,
  ICON_STROKE_WIDTH,
  ICON_VIEW_BOX,
  getIconPrimitives,
  renderIconMarkup,
  type RenderIconOptions,
} from './icons/index.js';

export * from './components/index.js';

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
