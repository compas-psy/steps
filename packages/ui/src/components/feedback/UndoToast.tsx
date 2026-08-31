/**
 * `UndoToast` — визуально специфичный тост завершения действия с отменой
 * (§10 «Feedback», прототип `ШАГИ - R1 Design.dc.html` «ST · Completion +
 * Undo toast (§58)», строки ~757–773): тёмный форест-фон (`--forest-900`),
 * белый текст, золотая (`--gold-400`) ссылка-действие, `--shadow-floating`.
 * Ни один текст не хардкожен («Отменить» и подобное в прототипе —
 * иллюстрация, не значение по умолчанию) — `message`/`actionLabel`
 * обязательные пропсы, перевод приносит вызывающий код (ТЗ §3).
 */
import type { ReactElement, ReactNode } from 'react';

import './UndoToast.css';

export interface UndoToastProps {
  readonly message: ReactNode;
  readonly actionLabel: ReactNode;
  readonly onAction: () => void;
  readonly className?: string;
}

export function UndoToast({
  message,
  actionLabel,
  onAction,
  className,
}: UndoToastProps): ReactElement {
  return (
    <div
      className={['shagi-undo-toast', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
    >
      <span className="shagi-undo-toast__message">{message}</span>
      <button type="button" className="shagi-undo-toast__action" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
