/**
 * `DraftIndicator` — маленький индикатор «есть несохранённый черновик»
 * (§10 «Capture», задание E03.7). По образцу `feedback/SyncState.tsx`:
 * `role="status"`/`aria-live="polite"` вместо шумного `alert` (§15 —
 * «polite aria-live completion/sync, not noisy reorder announcements»,
 * тот же принцип применим к тихому фоновому факту «черновик есть», не
 * к прерывающему уведомлению), точка декоративна, доступное имя целиком
 * несёт обязательный `label` — текст приносит вызывающий код
 * (`packages/i18n`, ТЗ §3), сам компонент не хардкодит формулировку.
 */
import type { ReactElement } from 'react';

export interface DraftIndicatorProps {
  readonly label: string;
  readonly className?: string;
}

export function DraftIndicator({ label, className }: DraftIndicatorProps): ReactElement {
  return (
    <span
      className={['shagi-draft-indicator', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="shagi-draft-indicator__dot" aria-hidden="true" />
    </span>
  );
}
