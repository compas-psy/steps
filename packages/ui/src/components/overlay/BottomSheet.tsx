/**
 * `BottomSheet` — мобильный аналог `Modal` (§10 «Overlay»): та же
 * модальная логика фокуса (`Modal.tsx` — открытие переносит фокус внутрь,
 * `Tab`/`Shift+Tab` не выпускают его наружу, `Escape` закрывает, закрытие
 * возвращает фокус на элемент-триггер), другая визуальная форма — панель
 * снизу экрана, а не центрированная карточка (`BottomSheet.css`).
 *
 * Логика фокуса намеренно продублирована с `Modal`, а не вынесена в общий
 * компонент-обёртку: два разных корневых элемента с разной семантикой
 * заголовка/футера ради общего родителя дали бы более запутанный API, чем
 * общий хук+функция (`internal/focusTrap.ts`), которым оба уже пользуются.
 */
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useRef,
} from 'react';

import { trapTabKey, useOverlayFocus } from './internal/focusTrap.js';
import './BottomSheet.css';

export interface BottomSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: ReactNode;
  readonly 'aria-label'?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly className?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  'aria-label': ariaLabel,
  children,
  footer,
  className,
}: BottomSheetProps): ReactElement | null {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  useOverlayFocus(open, sheetRef);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    const sheet = sheetRef.current;
    if (sheet) {
      trapTabKey(event, sheet);
    }
  };

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="shagi-bottom-sheet-overlay" onMouseDown={handleOverlayMouseDown}>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        aria-label={title === undefined ? ariaLabel : undefined}
        tabIndex={-1}
        className={['shagi-bottom-sheet', className].filter(Boolean).join(' ')}
        onKeyDown={handleKeyDown}
      >
        <span className="shagi-bottom-sheet__grabber" aria-hidden="true" />
        {title !== undefined && (
          <div className="shagi-bottom-sheet__header">
            <h2 id={titleId} className="shagi-bottom-sheet__title">
              {title}
            </h2>
          </div>
        )}
        <div className="shagi-bottom-sheet__body">{children}</div>
        {footer !== undefined && <div className="shagi-bottom-sheet__footer">{footer}</div>}
      </div>
    </div>
  );
}
