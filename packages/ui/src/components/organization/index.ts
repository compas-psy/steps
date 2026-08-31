/**
 * Барель компонентов организации `@shagi/ui` (E03.6 «компоненты
 * организации», см. `04_UI_DESIGN_SYSTEM.md` §10 «Organization» и
 * `.ultraplan/research/02-ui.md` §2 «Organization»). Территория этого
 * пакета работ — сам подкаталог `src/components/organization/`; сведение
 * в публичный барель компонентов (`../index.ts`) и в точку входа пакета
 * (`../../index.ts`) — отдельная задача сведения при приёмке, тем же
 * приёмом, что `navigation/index.ts`/`feedback/index.ts` остаются не
 * подключёнными до своей интеграции (см. комментарий там).
 */
export { BoardCard, type BoardCardProps } from './BoardCard.js';
export { BoardColumn, type BoardColumnProps } from './BoardColumn.js';
export { Filter, type FilterProps } from './Filter.js';
export { Label, type LabelProps } from './Label.js';
export type { MarkerColor } from './internal/markerColor.js';
export { Priority, type PriorityLevel, type PriorityProps } from './Priority.js';
export { ProjectHeader, type ProjectHeaderProps } from './ProjectHeader.js';
export { ProjectRow, type ProjectRowProps } from './ProjectRow.js';
export { Section, type SectionProps } from './Section.js';
