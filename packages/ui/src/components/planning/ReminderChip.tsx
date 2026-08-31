/**
 * `ReminderChip` — чип напоминания задачи. Тонкая обёртка над `Chip`:
 * фиксирует иконку `bell`, остальное пропускает без изменений — см.
 * `DateChip.tsx`.
 */
import type { ReactElement } from 'react';

import { Chip } from '../Chip.js';
import type { PlanningChipProps } from './internal/chipProps.js';

export type ReminderChipProps = PlanningChipProps;

export function ReminderChip({ label, ...rest }: ReminderChipProps): ReactElement {
  return (
    <Chip icon="bell" {...rest}>
      {label}
    </Chip>
  );
}
