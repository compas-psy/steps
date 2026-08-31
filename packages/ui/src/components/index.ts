/**
 * Барель компонентов `@shagi/ui` (E03.1 «примитивы» + generic-компоненты
 * DS-бандла из `.ultraplan/research/02-ui.md` §2, плюс навигация из E03.2,
 * оверлеи/feedback из E03.3 и задачные/планирование/организация/захват из
 * E03.4–E03.7). Реэкспортируется из `../index.ts` — публичный API пакета
 * остаётся единой точкой `./src/index.ts` (глубокие импорты запрещены, см.
 * `.oxlintrc.json`, правило про `no-restricted-imports`/единую точку входа).
 *
 * Сведение подкаталоговых барелей (`navigation/`, `overlay/`, `feedback/`,
 * `task/`, `planning/`, `organization/`, `capture/`) — на приёмке
 * соответствующих пакетов работ: каждый пакет работ намеренно не трогал
 * этот файл, чтобы не столкнуться с параллельно идущим соседним пакетом
 * работ в том же родительском каталоге.
 */

export { Badge, type BadgeProps, type BadgeVariant } from './Badge.js';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button.js';
export {
  Card,
  CardBody,
  type CardBodyProps,
  CardHeader,
  type CardHeaderProps,
  type CardPadding,
  type CardProps,
} from './Card.js';
export { Checkbox, type CheckboxProps } from './Checkbox.js';
export { Chip, type ChipProps, type ChipTone } from './Chip.js';
export { Divider, type DividerOrientation, type DividerProps } from './Divider.js';
export { Icon, type IconProps } from './Icon.js';
export {
  IconButton,
  type IconButtonProps,
  type IconButtonSize,
  type IconButtonVariant,
} from './IconButton.js';
export { Input, type InputProps } from './Input.js';
export { Radio, type RadioProps } from './Radio.js';
export {
  SegmentedControl,
  type SegmentedControlAccent,
  type SegmentedControlProps,
  type SegmentOption,
} from './SegmentedControl.js';
export { ServiceMark, type ServiceMarkProps, type ServiceMarkShape } from './ServiceMark.js';
export { Spinner, type SpinnerProps, type SpinnerSize, type SpinnerTone } from './Spinner.js';
export { Switch, type SwitchProps } from './Switch.js';
export { Textarea, type TextareaProps } from './Textarea.js';
export { Tooltip, type TooltipPlacement, type TooltipProps } from './Tooltip.js';

// --- Навигация (E03.2) --------------------------------------------------
export { Breadcrumb, type BreadcrumbItem, type BreadcrumbProps } from './navigation/Breadcrumb.js';
export {
  BottomNav,
  type BottomNavCenterAction,
  type BottomNavItem,
  type BottomNavProps,
} from './navigation/BottomNav.js';
export {
  CommandPalette,
  type CommandPaletteItem,
  type CommandPaletteProps,
} from './navigation/CommandPalette.js';
export {
  Sidebar,
  type SidebarItem,
  type SidebarProps,
  type SidebarSection,
} from './navigation/Sidebar.js';
export { Tabs, type TabItem, type TabsProps } from './navigation/Tabs.js';
export { TopBar, type TopBarProps } from './navigation/TopBar.js';

// --- Overlay (E03.3) -----------------------------------------------------
export { BottomSheet, type BottomSheetProps } from './overlay/BottomSheet.js';
export { Modal, type ModalProps } from './overlay/Modal.js';
export {
  Menu,
  type MenuItemData,
  type MenuItemVariant,
  type MenuPlacement,
  type MenuProps,
  type MenuSectionData,
} from './overlay/Menu.js';
export { Popover, type PopoverPlacement, type PopoverProps } from './overlay/Popover.js';
export { SideInspector, type SideInspectorProps } from './overlay/SideInspector.js';

// --- Feedback (E03.3) ------------------------------------------------------
export { EmptyState, type EmptyStateProps } from './feedback/EmptyState.js';
export { ErrorState, type ErrorStateProps } from './feedback/ErrorState.js';
export { Loading, type LoadingProps } from './feedback/Loading.js';
export { Offline, type OfflineProps } from './feedback/Offline.js';
export { SyncState, type SyncStateProps, type SyncStateStatus } from './feedback/SyncState.js';
export { Toast, type ToastProps, type ToastVariant } from './feedback/Toast.js';
export { UndoToast, type UndoToastProps } from './feedback/UndoToast.js';

// --- Задачи (E03.4) -------------------------------------------------------
export { ChecklistRow, type ChecklistRowProps } from './task/ChecklistRow.js';
export { FocusMarker, type FocusMarkerProps } from './task/FocusMarker.js';
export { SubtaskRow, type SubtaskRowProps } from './task/SubtaskRow.js';
export { TaskCheckbox, type TaskCheckboxProps } from './task/TaskCheckbox.js';
export { TaskDetail, type TaskDetailProps } from './task/TaskDetail.js';
export { TaskMenu, type TaskMenuItemData, type TaskMenuProps } from './task/TaskMenu.js';
export {
  TaskMetadata,
  TaskMetadataItem,
  type TaskMetadataItemProps,
  type TaskMetadataProps,
} from './task/TaskMetadata.js';
export { TaskRow, type TaskRowProps, type TaskRowState } from './task/TaskRow.js';

// --- Планирование (E03.5) --------------------------------------------------
export { DateChip, type DateChipProps } from './planning/DateChip.js';
export { TimeChip, type TimeChipProps } from './planning/TimeChip.js';
export { DurationChip, type DurationChipProps } from './planning/DurationChip.js';
export { DeadlineChip, type DeadlineChipProps } from './planning/DeadlineChip.js';
export { ReminderChip, type ReminderChipProps } from './planning/ReminderChip.js';
export { RecurrenceChip, type RecurrenceChipProps } from './planning/RecurrenceChip.js';
export {
  DatePicker,
  type CalendarDate,
  type CalendarMonth,
  type DatePickerProps,
} from './planning/DatePicker.js';
export { TimePicker, type TimePickerProps, type TimeValue } from './planning/TimePicker.js';
export {
  TemporalConflict,
  type TemporalConflictProps,
  type TemporalConflictType,
} from './planning/TemporalConflict.js';

// --- Организация (E03.6) ---------------------------------------------------
export { BoardCard, type BoardCardProps } from './organization/BoardCard.js';
export { BoardColumn, type BoardColumnProps } from './organization/BoardColumn.js';
export { Filter, type FilterProps } from './organization/Filter.js';
export { Label, type LabelProps } from './organization/Label.js';
export type { MarkerColor } from './organization/internal/markerColor.js';
export { Priority, type PriorityLevel, type PriorityProps } from './organization/Priority.js';
export { ProjectHeader, type ProjectHeaderProps } from './organization/ProjectHeader.js';
export { ProjectRow, type ProjectRowProps } from './organization/ProjectRow.js';
export { Section, type SectionProps } from './organization/Section.js';

// --- Захват (E03.7) ---------------------------------------------------------
export { Composer, type ComposerMode, type ComposerProps } from './capture/Composer.js';
export { DraftIndicator, type DraftIndicatorProps } from './capture/DraftIndicator.js';
export {
  InheritedContextChip,
  type InheritedContextChipProps,
} from './capture/InheritedContextChip.js';
export { NLPToken, type NLPTokenKind, type NLPTokenProps } from './capture/NLPToken.js';
export {
  ParsingPreview,
  type ParsingPreviewProps,
  type ParsingPreviewToken,
} from './capture/ParsingPreview.js';
export { QuickAdd, type QuickAddProps } from './capture/QuickAdd.js';
