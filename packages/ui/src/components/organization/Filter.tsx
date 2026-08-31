/**
 * `Filter` — чип/переключатель активного фильтра (§10 «Organization»:
 * «Default/Selected/Removable, тот же паттерн состояний, что Chip»; §16
 * «System filters R1»: Без даты / P1 / Критичные / Не по плану / Просрочен
 * срок / Повторяющиеся — read-only предустановленные фильтры).
 *
 * Дословно тонкая обёртка над `Chip` (`../Chip.tsx`) — тот же приём, что
 * задание требует для `ProjectHeader`/`Menu`: спецификация сама говорит
 * «тот же паттерн состояний, что Chip», так что переизобретать
 * Default/Selected/Removable/клавиатуру/a11y второй раз — плодить
 * рассинхронизацию, а не новый компонент. `tone` фиксирован на
 * `'neutral'` — системные фильтры не окрашены палитрой проектов/меток
 * (§4.1 «Controlled tokens only» — та палитра про проекты/метки, не про
 * фильтры), различие несёт `selected`, а не цвет.
 */
import type { MouseEventHandler, ReactElement, ReactNode } from 'react';

import { Chip } from '../Chip.js';
import './Filter.css';

interface FilterBaseProps {
  readonly children: ReactNode;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
  readonly className?: string;
}

type FilterRemovableProps =
  | { readonly removable?: false; readonly removeLabel?: undefined; readonly onRemove?: undefined }
  | { readonly removable: true; readonly removeLabel: string; readonly onRemove: () => void };

export type FilterProps = FilterBaseProps & FilterRemovableProps;

export function Filter(props: FilterProps): ReactElement {
  const classes = ['shagi-filter', props.className].filter(Boolean).join(' ');
  return <Chip {...props} tone="neutral" className={classes} />;
}
