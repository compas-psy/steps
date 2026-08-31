/**
 * `ErrorState` — состояние ошибки экрана (§10 «Feedback», в иерархии ТЗ
 * называется просто «Error»; здесь `ErrorState`, чтобы не затенять
 * встроенный `Error` — `no-shadow-restricted-names` считает это подозрительным
 * паттерном, а глобальный класс ошибок остаётся доступным без переименования
 * в любом файле, который импортирует этот компонент). Иконка, заголовок и
 * описание — слоты через пропсы (ТЗ §3, никакого текста внутри пакета),
 * опциональное действие повтора — тоже слот, не строка: подпись кнопки
 * повтора вызывающий код формулирует сам через `packages/i18n`.
 *
 * `role="alert"` на корне — экран, который заблокирован ошибкой, стоит
 * анонсировать сразу (в отличие от вежливого `Toast`/`Loading`, где
 * `role="status"`/`aria-live="polite"` достаточно, здесь ошибка мешает
 * основному сценарию целиком).
 */
import type { ReactElement, ReactNode } from 'react';

import './ErrorState.css';

export interface ErrorStateProps {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Действие повтора — слот (обычно `Button` с `onClick`), не отдельная
   * пара `label`/`onRetry`: вызывающий код и так решает, что показывать
   * (кнопка, ссылка, несколько действий). */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function ErrorState({
  icon,
  title,
  description,
  action,
  className,
}: ErrorStateProps): ReactElement {
  return (
    <div className={['shagi-error-state', className].filter(Boolean).join(' ')} role="alert">
      {icon !== undefined && (
        <div className="shagi-error-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="shagi-error-state__title">{title}</p>
      {description !== undefined && <p className="shagi-error-state__description">{description}</p>}
      {action !== undefined && <div className="shagi-error-state__action">{action}</div>}
    </div>
  );
}
