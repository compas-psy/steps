/**
 * `EmptyState` — пустое состояние экрана (§10 «Feedback»). Иконка/
 * иллюстрация, заголовок и описание — слоты через пропсы, не текст пакета:
 * продуктовые формулировки ШАГОВ («На сегодня всё.», «Входящие разобраны.»,
 * §18 «Copy, empty states») задаёт вызывающий код через `packages/i18n`, не
 * этот компонент (ТЗ §3).
 */
import type { ReactElement, ReactNode } from 'react';

import './EmptyState.css';

export interface EmptyStateProps {
  /** Иконка/иллюстрация — декоративный слот (`aria-hidden` на обёртке),
   * смысл несут `title`/`description`. */
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div className={['shagi-empty-state', className].filter(Boolean).join(' ')}>
      {icon !== undefined && (
        <div className="shagi-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="shagi-empty-state__title">{title}</p>
      {description !== undefined && <p className="shagi-empty-state__description">{description}</p>}
      {action !== undefined && <div className="shagi-empty-state__action">{action}</div>}
    </div>
  );
}
