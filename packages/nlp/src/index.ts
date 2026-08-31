/**
 * `@shagi/nlp` — детерминированный русский парсер для Quick Add (SPEC/00 §0,
 * раздел «Baseline stack»: цели R1 включают «deterministic Russian NLP»;
 * грамматика — `01_PRODUCT_BEHAVIOR_R1.md` §4, конспект `.ultraplan/
 * research/01-domain.md` §6).
 *
 * Парсер детерминирован по определению: одинаковый ввод — одинаковый
 * результат, без обращения к сети или ML-инференса. Результат разбора —
 * чистая структура (заголовок + принятые чипы + отклонённые/неоднозначные
 * кандидаты), а не черновик `CreateTaskCommand` и не мутация домена —
 * построение команды из этой структуры и accept/reject/edit-состояние UI
 * относятся к другим пакетам работ (E05.x, `packages/app`).
 */
export const PACKAGE_NAME = '@shagi/nlp' as const;

export { parseQuickAdd } from './parse.js';

export type {
  AcceptedChip,
  AnyAcceptedChip,
  AnyRejectedCandidate,
  ChipCategory,
  ChipOrigin,
  ChipValueByCategory,
  DateChipValue,
  DeadlineChipValue,
  DurationChipValue,
  InheritedContext,
  LabelChipValue,
  NowContext,
  ParseQuickAddInput,
  ParseQuickAddResult,
  PriorityChipValue,
  ProjectChipValue,
  RecurrenceChipValue,
  RecurrenceUnit,
  RejectedCandidate,
  RejectionReason,
  SourceSpan,
  TimeChipValue,
  TitleResult,
} from './types.js';
