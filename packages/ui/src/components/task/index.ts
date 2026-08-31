/**
 * Барель подкаталога `task/` (пакет работ E03.4 «компоненты задач в
 * дизайн-системе», `.ultraplan/research/02-ui.md` §2 «Task»: TaskCheckbox,
 * TaskRow, TaskMetadata, FocusMarker, SubtaskRow, ChecklistRow, TaskMenu,
 * TaskDetail).
 *
 * Публичный API пакета остаётся единой точкой `packages/ui/src/index.ts` —
 * этот файл туда пока НЕ реэкспортирован намеренно (задание E03.4:
 * «Не трогай components/index.ts, src/index.ts» — параллельно идёт
 * `components/planning/` в том же родительском каталоге, сведение барелей —
 * на приёмке обоих пакетов работ разом, не здесь).
 */

export { ChecklistRow, type ChecklistRowProps } from './ChecklistRow.js';
export { FocusMarker, type FocusMarkerProps } from './FocusMarker.js';
export { SubtaskRow, type SubtaskRowProps } from './SubtaskRow.js';
export { TaskCheckbox, type TaskCheckboxProps } from './TaskCheckbox.js';
export { TaskDetail, type TaskDetailProps } from './TaskDetail.js';
export {
  TaskMenu,
  type TaskMenuItemData,
  type TaskMenuProps,
} from './TaskMenu.js';
export {
  TaskMetadata,
  TaskMetadataItem,
  type TaskMetadataItemProps,
  type TaskMetadataProps,
} from './TaskMetadata.js';
export { TaskRow, type TaskRowProps, type TaskRowState } from './TaskRow.js';
