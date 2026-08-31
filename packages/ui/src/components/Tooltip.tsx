/**
 * `Tooltip` — подсказка (§10 «Primitives»). Оборачивает единственный
 * дочерний элемент-триггер (`cloneElement`) и добавляет к нему
 * `aria-describedby` на пузырь, плюс hover/focus/`Escape`-обработчики — сам
 * триггер и его пропсы приносит вызывающий код, `Tooltip` ничего не
 * подставляет вместо них (`callHandler` вызывает исходный обработчик перед
 * своим, а не заменяет его).
 *
 * Текст подсказки — `ReactNode`, продуктовую строку внутрь пакета не
 * зашиваем (ТЗ §3).
 */
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  cloneElement,
  isValidElement,
  useId,
  useState,
} from 'react';

import './Tooltip.css';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  readonly content: ReactNode;
  readonly placement?: TooltipPlacement;
  /** Единственный элемент-триггер — клонируется с добавленными
   * обработчиками/`aria-describedby`, не оборачивается лишним узлом. */
  readonly children: ReactElement;
  readonly className?: string;
}

function callHandler<E>(handler: unknown, event: E): void {
  if (typeof handler === 'function') {
    (handler as (event: E) => void)(event);
  }
}

export function Tooltip({
  content,
  placement = 'top',
  children,
  className,
}: TooltipProps): ReactElement {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  if (!isValidElement(children)) {
    return children;
  }

  const child = children as ReactElement<Record<string, unknown>>;
  const childProps = child.props;

  const trigger = cloneElement(child, {
    'aria-describedby': tooltipId,
    onMouseEnter: (event: unknown) => {
      callHandler(childProps['onMouseEnter'], event);
      setOpen(true);
    },
    onMouseLeave: (event: unknown) => {
      callHandler(childProps['onMouseLeave'], event);
      setOpen(false);
    },
    onFocus: (event: unknown) => {
      callHandler(childProps['onFocus'], event);
      setOpen(true);
    },
    onBlur: (event: unknown) => {
      callHandler(childProps['onBlur'], event);
      setOpen(false);
    },
    onKeyDown: (event: KeyboardEvent) => {
      callHandler(childProps['onKeyDown'], event);
      if (event.key === 'Escape') {
        setOpen(false);
      }
    },
  });

  const bubbleClasses = [
    'shagi-tooltip__bubble',
    `shagi-tooltip__bubble--${placement}`,
    open ? 'shagi-tooltip__bubble--open' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={['shagi-tooltip', className].filter(Boolean).join(' ')}>
      {trigger}
      <span role="tooltip" id={tooltipId} className={bubbleClasses}>
        {content}
      </span>
    </span>
  );
}
