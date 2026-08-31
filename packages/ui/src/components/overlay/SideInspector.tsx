/**
 * `SideInspector` — десктопная боковая панель (§10 «Overlay», прототип
 * `ШАГИ - R1 Design.dc.html` D01/D09/D19: список задач слева остаётся
 * видимым и кликабельным, панель — часть флекс-лэйаута, а не оверлей поверх
 * экрана).
 *
 * Отличие от `Modal`/`BottomSheet` — прямая цитата задания: «список позади
 * остаётся видимым (не модальная в смысле фокус-trap на весь экран, но
 * фокус внутри неё управляем)». Здесь это означает: при открытии фокус
 * переносится внутрь панели и при закрытии возвращается на элемент-триггер
 * (`useOverlayFocus`, тот же хук, что у Modal/BottomSheet), но `Tab` не
 * зациклен внутри (`trapTabKey` из `internal/focusTrap.ts` намеренно не
 * вызывается) — фокус свободно уходит обратно в список задач позади, как
 * непосредственно и требует задание.
 */
import { type KeyboardEvent, type ReactElement, type ReactNode, useId, useRef } from 'react';

import { useOverlayFocus } from './internal/focusTrap.js';
import './SideInspector.css';

export interface SideInspectorProps {
  readonly open: boolean;
  /** Необязателен: панель может не иметь способа закрыться из себя самой
   * (например, закрывается выбором другой задачи в списке позади). */
  readonly onClose?: () => void;
  readonly title?: ReactNode;
  /** Слот действий в шапке (например `IconButton` с закрытием) — доступное
   * имя такой кнопки и её текст приносит вызывающий код (ТЗ §3). */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function SideInspector({
  open,
  onClose,
  title,
  actions,
  children,
  className,
}: SideInspectorProps): ReactElement | null {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);

  useOverlayFocus(open, panelRef);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape' && onClose) {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <aside
      ref={panelRef}
      aria-labelledby={title !== undefined ? titleId : undefined}
      tabIndex={-1}
      className={['shagi-side-inspector', className].filter(Boolean).join(' ')}
      onKeyDown={handleKeyDown}
    >
      {(title !== undefined || actions !== undefined) && (
        <div className="shagi-side-inspector__header">
          {title !== undefined && (
            <h2 id={titleId} className="shagi-side-inspector__title">
              {title}
            </h2>
          )}
          {actions !== undefined && <div className="shagi-side-inspector__actions">{actions}</div>}
        </div>
      )}
      <div className="shagi-side-inspector__body">{children}</div>
    </aside>
  );
}
