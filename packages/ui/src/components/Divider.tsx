/**
 * `Divider` — разделитель (§10 «Primitives»). Соответствует «Separator» из
 * образца СИМПАС по смыслу (`.ultraplan/research/02-ui.md` §6), но назван
 * так, как называет его сама иерархия компонентов ШАГОВ (§10) — прямого
 * заимствования API здесь не требовалось (?13: «теми же именами пропсов» —
 * про Button/Input/Card/Badge/SegmentedControl/Icon/ServiceMark, где эти
 * имена реально что-то значат для продукта; здесь единственный смысловой
 * пропс — ориентация, и он назван по смыслу).
 */
import type { HTMLAttributes, ReactElement } from 'react';

import './Divider.css';

export type DividerOrientation = 'horizontal' | 'vertical';

export interface DividerProps extends Omit<HTMLAttributes<HTMLHRElement>, 'children'> {
  readonly orientation?: DividerOrientation;
}

export function Divider({
  orientation = 'horizontal',
  className,
  ...rest
}: DividerProps): ReactElement {
  const classes = ['shagi-divider', `shagi-divider--${orientation}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <hr
      {...rest}
      className={classes}
      aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
    />
  );
}
