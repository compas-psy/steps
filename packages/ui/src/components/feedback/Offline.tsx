/**
 * `Offline` — индикатор отсутствия сети (§10 «Feedback»). Без текста внутри
 * компонента (задание) — иконка декоративна, доступное имя обязателен через
 * `label` (тот же контракт, что `IconButton.label`/`Spinner.label`: типы не
 * дают собрать индикатор без имени, `label` не опционален).
 *
 * `icon` — слот со значением по умолчанию (встроенная `warning` — единственная
 * в реестре E03.0, семантически подходящая «нет соединения»), вызывающий код
 * волен переопределить своей иллюстрацией.
 */
import type { ReactElement, ReactNode } from 'react';

import { Icon } from '../Icon.js';
import './Offline.css';

export interface OfflineProps {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly className?: string;
}

export function Offline({ icon, label, className }: OfflineProps): ReactElement {
  return (
    <span
      className={['shagi-offline', className].filter(Boolean).join(' ')}
      role="status"
      aria-label={label}
    >
      <span className="shagi-offline__icon" aria-hidden="true">
        {icon ?? <Icon name="warning" size={14} />}
      </span>
    </span>
  );
}
