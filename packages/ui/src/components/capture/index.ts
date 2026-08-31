/**
 * Барель подкаталога `capture/` (E03.7 «компоненты захвата», §10
 * «Capture»: QuickAdd, Composer, NLPToken, InheritedContextChip,
 * ParsingPreview, DraftIndicator).
 *
 * Публичный API пакета остаётся единой точкой `packages/ui/src/index.ts`
 * (по образцу `feedback/index.ts`, `navigation/index.ts`) — этот файл
 * реэкспортируется оттуда через `components/index.ts` на приёмке пакета
 * работ, не здесь (границы задания E03.7 — только этот каталог).
 */

export { Composer, type ComposerMode, type ComposerProps } from './Composer.js';
export { DraftIndicator, type DraftIndicatorProps } from './DraftIndicator.js';
export { InheritedContextChip, type InheritedContextChipProps } from './InheritedContextChip.js';
export { NLPToken, type NLPTokenKind, type NLPTokenProps } from './NLPToken.js';
export {
  ParsingPreview,
  type ParsingPreviewProps,
  type ParsingPreviewToken,
} from './ParsingPreview.js';
export { QuickAdd, type QuickAddProps } from './QuickAdd.js';
