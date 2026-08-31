/**
 * `Spinner` — индикатор загрузки (§10 «Primitives»).
 *
 * Доступность: тот же контракт `label`, что и у `Icon`/`renderIconMarkup`
 * (§15) — задан `label` → `role="status"` с этим именем (текст перевода
 * приносит вызывающий код, `packages/i18n`); не задан → `aria-hidden`,
 * подразумевается, что занятость уже объявлена контейнером (например,
 * `Button` со своим `aria-busy`, чтобы не дублировать анонс дважды).
 */
import type { ReactElement } from 'react';

import './Spinner.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerTone = 'primary' | 'muted' | 'current';

export interface SpinnerProps {
  readonly size?: SpinnerSize;
  readonly tone?: SpinnerTone;
  readonly label?: string;
  readonly className?: string;
}

export function Spinner({
  size = 'md',
  tone = 'primary',
  label,
  className,
}: SpinnerProps): ReactElement {
  const classes = ['shagi-spinner', `shagi-spinner--${size}`, `shagi-spinner--${tone}`, className]
    .filter(Boolean)
    .join(' ');
  const a11yProps =
    label !== undefined
      ? { role: 'status' as const, 'aria-label': label }
      : { 'aria-hidden': true as const };

  return <span className={classes} {...a11yProps} />;
}
