/**
 * `TimeChip` — чип времени задачи (§5: `PlainTime | null` рядом с Planned
 * Date). Тонкая обёртка над `Chip`: фиксирует иконку `clock`, остальное
 * пропускает без изменений — см. `DateChip.tsx` для полного объяснения
 * паттерна.
 */
import type { ReactElement } from 'react';

import { Chip } from '../Chip.js';
import type { PlanningChipProps } from './internal/chipProps.js';

export type TimeChipProps = PlanningChipProps;

export function TimeChip({ label, ...rest }: TimeChipProps): ReactElement {
  return (
    <Chip icon="clock" {...rest}>
      {label}
    </Chip>
  );
}
