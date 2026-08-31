/**
 * Барель подкаталога `overlay/` (E03.3 «оверлейные и feedback-компоненты»,
 * §10 «Overlay»: BottomSheet, Modal, SideInspector, Menu, Popover).
 *
 * Публичный API пакета остаётся единой точкой `packages/ui/src/index.ts` —
 * этот файл реэкспортируется оттуда через `components/index.ts` (сведение
 * барелей — на приёмке пакета работ, не здесь). `internal/` не
 * реэкспортируется — общий фокус-trap/outside-dismiss не публичный API,
 * а деталь реализации, которой пользуются только компоненты этого
 * подкаталога.
 */

export { BottomSheet, type BottomSheetProps } from './BottomSheet.js';
export { Modal, type ModalProps } from './Modal.js';
export {
  Menu,
  type MenuItemData,
  type MenuItemVariant,
  type MenuPlacement,
  type MenuProps,
  type MenuSectionData,
} from './Menu.js';
export { Popover, type PopoverPlacement, type PopoverProps } from './Popover.js';
export { SideInspector, type SideInspectorProps } from './SideInspector.js';
