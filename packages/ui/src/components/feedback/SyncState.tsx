/**
 * `SyncState` — индикатор состояния синхронизации (§10 «Feedback», §15
 * «polite aria-live completion/sync, not noisy reorder announcements» —
 * эта строка ТЗ буквально про этот компонент). `status` — закрытый
 * перечень (`idle`/`syncing`/`error`), не текст: у каждого значения своя
 * иконка (`check`/`sync`/`warning`), не только цвет (§11 «state never
 * color-only») — `syncing` дополнительно вращается через `--motion-*`
 * токены и останавливается под `prefers-reduced-motion` (§7), оставляя
 * иконку статичной, а не пропадающей.
 *
 * Без текста внутри компонента, как и `Offline` — `label` обязателен
 * (перевод конкретной формулировки статуса приносит вызывающий код).
 */
import type { ReactElement } from 'react';

import { Icon } from '../Icon.js';
import './SyncState.css';

export type SyncStateStatus = 'idle' | 'syncing' | 'error';

const STATUS_ICON: Record<SyncStateStatus, 'check' | 'sync' | 'warning'> = {
  idle: 'check',
  syncing: 'sync',
  error: 'warning',
};

export interface SyncStateProps {
  readonly status: SyncStateStatus;
  readonly label: string;
  readonly className?: string;
}

export function SyncState({ status, label, className }: SyncStateProps): ReactElement {
  return (
    <span
      className={['shagi-sync-state', `shagi-sync-state--${status}`, className]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="shagi-sync-state__icon" aria-hidden="true">
        <Icon name={STATUS_ICON[status]} size={16} />
      </span>
    </span>
  );
}
