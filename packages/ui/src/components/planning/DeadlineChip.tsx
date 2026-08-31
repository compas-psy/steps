/**
 * `DeadlineChip` — чип срока задачи (Deadline, отдельное от Planned Date
 * temporal-поле — §5). Тонкая обёртка над `Chip`: фиксирует иконку
 * `deadline`, остальное (включая `tone`, например тревожный `red` при
 * просрочке — решает вызывающий код по данным задачи, не этот компонент)
 * пропускает без изменений — см. `DateChip.tsx`.
 */
import type { ReactElement } from 'react';

import { Chip } from '../Chip.js';
import type { PlanningChipProps } from './internal/chipProps.js';

export type DeadlineChipProps = PlanningChipProps;

export function DeadlineChip({ label, ...rest }: DeadlineChipProps): ReactElement {
  return (
    <Chip icon="deadline" {...rest}>
      {label}
    </Chip>
  );
}
