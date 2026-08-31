/**
 * `Toast` — короткое всплывающее уведомление (§10 «Feedback»). Не сама
 * решает, когда появляться/исчезать и где стоять в стеке (очередь,
 * автозакрытие по таймеру — задача вызывающего кода/`packages/app`,
 * который знает продуктовые правила «сколько показывать»); компонент
 * только рендерит одну карточку уведомления с нужной ролью.
 *
 * §15 «polite aria-live completion/sync, not noisy reorder announcements»:
 * обычный тост объявляется вежливо (`role="status"`, `aria-live="polite"`),
 * `variant="error"` — настойчивее (`role="alert"`, неявно `assertive`),
 * потому что ошибку, в отличие от обычного подтверждения, недостаточно
 * заметить при следующей паузе скринридера.
 */
import { type ReactElement, type ReactNode } from 'react';

import type { IconName } from '../../icons/index.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';
import './Toast.css';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface ToastProps {
  readonly message: ReactNode;
  readonly variant?: ToastVariant;
  /** Декоративная иконка слева — по умолчанию нет; если задана, смысл всё
   * равно несёт `message`, иконка дополняет (§11 «state never color-only»). */
  readonly icon?: IconName;
  readonly action?: ReactNode;
  /** Показывает кнопку закрытия, если задан обработчик. Доступное имя
   * кнопки — обязательный `dismissLabel` (перевод приносит вызывающий код,
   * `packages/i18n` — тот же контракт, что `IconButton.label`). */
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
  readonly className?: string;
}

export function Toast({
  message,
  variant = 'default',
  icon,
  action,
  onDismiss,
  dismissLabel,
  className,
}: ToastProps): ReactElement {
  const classes = ['shagi-toast', `shagi-toast--${variant}`, className].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
    >
      {icon !== undefined && (
        <span className="shagi-toast__icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="shagi-toast__message">{message}</span>
      {action !== undefined && <span className="shagi-toast__action">{action}</span>}
      {onDismiss && dismissLabel !== undefined && (
        <IconButton
          icon="close"
          label={dismissLabel}
          size="sm"
          variant="ghost"
          className="shagi-toast__dismiss"
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
