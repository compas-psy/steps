/**
 * `DurationChip` — чип длительности задачи (§5: целые минуты, не `Date`-
 * интервал). Тонкая обёртка над `Chip`: фиксирует иконку `duration`,
 * остальное пропускает без изменений — см. `DateChip.tsx`.
 */
import type { ReactElement } from 'react';

import { Chip } from '../Chip.js';
import type { PlanningChipProps } from './internal/chipProps.js';

export type DurationChipProps = PlanningChipProps;

export function DurationChip({ label, ...rest }: DurationChipProps): ReactElement {
  return (
    <Chip icon="duration" {...rest}>
      {label}
    </Chip>
  );
}
