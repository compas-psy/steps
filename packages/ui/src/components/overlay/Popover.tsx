/**
 * `Popover` — всплывающий произвольный контент у якорного элемента (§10
 * «Overlay»). Тот же принцип позиционирования, что уже решает `Tooltip`
 * (`Tooltip.tsx`/`Tooltip.css`): `position: relative` на обёртке якоря +
 * `position: absolute` + `placement`-классы (`top`/`bottom`/`left`/`right`)
 * на всплывающей панели, без коллизионной логики с краями экрана — задание
 * прямо просит не изобретать её здесь заново, раз `Tooltip` тоже её не
 * решает.
 *
 * В отличие от `Tooltip` (наводится/убирается по hover, единственный
 * клонируемый триггер, `content` — только текст) — `Popover` открывается
 * контролируемо (`open`/`onClose`, как `Menu`/`Modal`), якорь не
 * клонируется (рендерится как есть, `anchor` — просто соседний узел, не
 * получает синтетических обработчиков), а содержимое произвольное
 * (`children: ReactNode`, не только текст) и может включать интерактивные
 * элементы — поэтому нужен свой фокус-менеджмент (`useOverlayFocus`, тот же
 * хук что у `Menu`/`SideInspector`: перенос фокуса внутрь при открытии,
 * возврат на якорь при закрытии), а не только CSS-видимость.
 */
import { type KeyboardEvent, type ReactElement, type ReactNode, useId, useRef } from 'react';

import { useOverlayFocus } from './internal/focusTrap.js';
import { useOutsideDismiss } from './internal/useOutsideDismiss.js';
import './Popover.css';

export type PopoverPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface PopoverProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Якорный элемент — рендерится как есть, без клонирования обработчиков
   * (в отличие от `Tooltip.children`): вызывающий код сам решает, что
   * открывает поповер (клик, `onClick` на кнопке рядом и т.п.). */
  readonly anchor: ReactNode;
  readonly placement?: PopoverPlacement;
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'aria-label'?: string;
}

export function Popover({
  open,
  onClose,
  anchor,
  placement = 'bottom',
  children,
  className,
  'aria-label': ariaLabel,
}: PopoverProps): ReactElement {
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useOverlayFocus(open, panelRef);
  useOutsideDismiss(open, panelRef, onClose);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      onClose();
    }
  };

  return (
    <span className="shagi-popover">
      {anchor}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={['shagi-popover__panel', `shagi-popover__panel--${placement}`, className]
            .filter(Boolean)
            .join(' ')}
          onKeyDown={handleKeyDown}
        >
          {children}
        </div>
      )}
    </span>
  );
}
