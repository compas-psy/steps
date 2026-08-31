/**
 * `Card`/`CardHeader`/`CardBody` — по образцу СИМПАС (`?13`), см. `Card.css`.
 *
 * `interactive` + `onClick` — карточка становится доступной кнопкой:
 * `role="button"`, `tabIndex=0`, `Enter`/`Space` активируют её так же, как
 * клик. Реализовано через `element.click()` на клавише, а не через
 * подделку `MouseEvent` вручную — тот же приём, что рекомендует WAI-ARIA
 * APG для «div как кнопка»: настоящий клик проходит весь обычный путь React
 * (включая уже переданный `onClick`), не два параллельных пути с разными
 * типами события.
 */
import {
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  forwardRef,
} from 'react';

import './Card.css';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly interactive?: boolean;
  readonly padding?: CardPadding;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, padding = 'none', className, onKeyDown, children, ...rest },
  ref,
) {
  const classes = [
    'shagi-card',
    interactive ? 'shagi-card--interactive' : null,
    padding !== 'none' ? `shagi-card--padding-${padding}` : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const interactiveProps = interactive
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          onKeyDown?.(event);
          if ((event.key === 'Enter' || event.key === ' ') && !event.defaultPrevented) {
            event.preventDefault();
            event.currentTarget.click();
          }
        },
      }
    : { onKeyDown };

  return (
    <div {...rest} ref={ref} className={classes} {...interactiveProps}>
      {children}
    </div>
  );
});

export interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title: ReactNode;
  /** Декоративная иконка перед заголовком. */
  readonly icon?: ReactNode;
  /** Действие справа (например `IconButton`). */
  readonly action?: ReactNode;
}

export function CardHeader({
  title,
  icon,
  action,
  className,
  ...rest
}: CardHeaderProps): ReactElement {
  return (
    <div {...rest} className={['shagi-card-header', className].filter(Boolean).join(' ')}>
      <div className="shagi-card-header__title-group">
        {icon !== undefined && <span className="shagi-card-header__icon">{icon}</span>}
        <span className="shagi-card-header__title">{title}</span>
      </div>
      {action !== undefined && <div>{action}</div>}
    </div>
  );
}

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  readonly padding?: CardPadding;
  readonly children?: ReactNode;
}

export function CardBody({
  padding = 'md',
  className,
  children,
  ...rest
}: CardBodyProps): ReactElement {
  const classes = [
    'shagi-card-body',
    padding !== 'md' ? `shagi-card-body--padding-${padding}` : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div {...rest} className={classes}>
      {children}
    </div>
  );
}
