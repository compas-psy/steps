/**
 * `Modal` — десктопное модальное окно (§10 «Overlay»). §15 «Accessibility»
 * называет модальный focus-trap и возврат фокуса блокером релиза, не
 * опцией — поэтому это не декларативный `role="dialog"` поверх произвольной
 * разметки, а настоящий цикл: при открытии фокус уходит на первый
 * фокусируемый элемент диалога (на сам диалог, если фокусируемых нет),
 * `Tab`/`Shift+Tab` не выпускают фокус наружу (`trapTabKey`,
 * `internal/focusTrap.ts`), `Escape` закрывает, при закрытии фокус
 * возвращается на элемент, который открыл модалку (через cleanup эффекта в
 * `useOverlayFocus`, а не отдельным ручным `useEffect` здесь — одна точка
 * истины на оба поведения).
 *
 * Рендерится условно (`open ? … : null`), без портала: `position: fixed` в
 * `Modal.css` уже кладёт оверлей поверх всего дерева без выноса в отдельный
 * DOM-узел — тот же принцип, что и `Tooltip` (позиционирование через CSS, не
 * через `createPortal`), только Tooltip всегда в DOM, а `Modal` — только
 * пока `open`.
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
import './Modal.css';

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Заголовок диалога — рендерится как `<h2>` и связывается через
   * `aria-labelledby`. Если заголовка нет, доступное имя приносит
   * `aria-label`. */
  readonly title?: ReactNode;
  /** Доступное имя, когда видимого `title` нет (иначе диалог без имени —
   * нарушение §15 «semantic headings/landmarks»). */
  readonly 'aria-label'?: string;
  readonly children: ReactNode;
  /** Действия диалога (кнопки) — отдельный слот, а не часть `children`,
   * чтобы визуальный футер не завязывался на то, как вызывающий код решит
   * разметить контент. */
  readonly footer?: ReactNode;
  readonly className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  'aria-label': ariaLabel,
  children,
  footer,
  className,
}: ModalProps): ReactElement | null {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useOverlayFocus(open, dialogRef);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    const dialog = dialogRef.current;
    if (dialog) {
      trapTabKey(event, dialog);
    }
  };

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="shagi-modal-overlay" onMouseDown={handleOverlayMouseDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        aria-label={title === undefined ? ariaLabel : undefined}
        tabIndex={-1}
        className={['shagi-modal', className].filter(Boolean).join(' ')}
        onKeyDown={handleKeyDown}
      >
        {title !== undefined && (
          <div className="shagi-modal__header">
            <h2 id={titleId} className="shagi-modal__title">
              {title}
            </h2>
          </div>
        )}
        <div className="shagi-modal__body">{children}</div>
        {footer !== undefined && <div className="shagi-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
