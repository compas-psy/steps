/**
 * Барель компонентов `@shagi/ui` (E03.1 «примитивы» + generic-компоненты
 * DS-бандла из `.ultraplan/research/02-ui.md` §2). Реэкспортируется из
 * `../index.ts` — публичный API пакета остаётся единой точкой `./src/index.ts`
 * (глубокие импорты запрещены, см. `.oxlintrc.json`, правило про
 * `no-restricted-imports`/единую точку входа).
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
