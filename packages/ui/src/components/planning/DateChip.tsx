/**
 * `DateChip` — чип запланированной даты задачи (Planned Date, не путать с
 * `DeadlineChip` — `01_PRODUCT_BEHAVIOR_R1.md` §5 разводит их по смыслу,
 * это разные temporal-поля Task). Тонкая обёртка над `Chip`: фиксирует
 * иконку `calendar`, остальное (тон, `selected`/`removable`, обработчики)
 * — пропускает через без изменений, ничего не дублирует.
 */
import type { ReactElement } from 'react';

import { Chip } from '../Chip.js';
import type { PlanningChipProps } from './internal/chipProps.js';

export type DateChipProps = PlanningChipProps;

export function DateChip({ label, ...rest }: DateChipProps): ReactElement {
  return (
    <Chip icon="calendar" {...rest}>
      {label}
    </Chip>
  );
}
