/**
 * `Badge` — короткий статусный лейбл (§10 «generic-компоненты DS-бандла»,
 * `.ultraplan/research/02-ui.md` §2). `children` (текст) уже несёт смысл
 * не-цветом — `dot`/`icon` дополняют его, не заменяют (§11 «state never
 * color-only», задел под будущие TaskRow-бейджи).
 */
import type { ReactElement, ReactNode } from 'react';

import type { IconName } from '../icons/index.js';
import { Icon } from './Icon.js';
import './Badge.css';

export type BadgeVariant =
  'default' | 'secondary' | 'outline' | 'success' | 'pending' | 'info' | 'new' | 'destructive';

export interface BadgeProps {
  readonly children: ReactNode;
  readonly variant?: BadgeVariant;
  /** Маленькая точка перед текстом — чисто декоративный акцент. */
  readonly dot?: boolean;
  /** Декоративная иконка перед текстом — альтернатива/дополнение к `dot`. */
  readonly icon?: IconName;
  readonly className?: string;
}

export function Badge({
  children,
  variant = 'default',
  dot = false,
  icon,
  className,
}: BadgeProps): ReactElement {
  const classes = ['shagi-badge', `shagi-badge--${variant}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      {dot && <span className="shagi-badge__dot" aria-hidden="true" />}
      {icon !== undefined && (
        <span className="shagi-badge__icon">
          <Icon name={icon} size={12} />
        </span>
      )}
      {children}
    </span>
  );
}
