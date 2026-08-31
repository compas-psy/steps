/**
 * Публичная точка входа набора иконок (E03.0). Не подключена в
 * `../index.ts` пакета — по условиям этого пакета работ территория
 * ограничена `src/icons/`, интеграция в публичный API `@shagi/ui` и в
 * `package.json` (`exports`) — отдельная задача за пределами этой.
 */
export type { IconDefinition, IconPrimitive } from './types.js';
export { ICON_DEFINITIONS, ICON_NAMES, ICON_REGISTRY, type IconName } from './contours.js';
export {
  ICON_DEFAULT_SIZE,
  ICON_STROKE_LINECAP,
  ICON_STROKE_LINEJOIN,
  ICON_STROKE_WIDTH,
  ICON_VIEW_BOX,
} from './constants.js';
export { getIconPrimitives, renderIconMarkup, type RenderIconOptions } from './render.js';
