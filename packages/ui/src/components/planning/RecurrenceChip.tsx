/**
 * `RecurrenceChip` — чип правила повтора задачи. Тонкая обёртка над `Chip`:
 * фиксирует иконку `repeat`, остальное пропускает без изменений — см.
 * `DateChip.tsx`.
 */
import type { ReactElement } from 'react';

import { Chip } from '../Chip.js';
import type { PlanningChipProps } from './internal/chipProps.js';

export type RecurrenceChipProps = PlanningChipProps;

export function RecurrenceChip({ label, ...rest }: RecurrenceChipProps): ReactElement {
  return (
    <Chip icon="repeat" {...rest}>
      {label}
    </Chip>
  );
}
