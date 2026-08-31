/**
 * `SyncStatus` — компактный статусный индикатор синхронизации для
 * настроек/профиля (§10 «Account/Data»). Не дублирует `feedback/SyncState`
 * (см. обоснование в отчёте пакета работ E03.8: тот — icon-only индикатор
 * уровня всего приложения без видимого текста, три состояния
 * `idle/syncing/error`, доступное имя только через `aria-label`; этот —
 * видимая строка с текстовой меткой статуса и меткой времени последней
 * синхронизации, четыре состояния, включая `offline`, которого у
 * `SyncState` нет вовсе — оффлайн и ошибка синхронизации требуют разного
 * действия пользователя (подождать сеть vs разобраться с конфликтом), их
 * смешение под одним `error`-статусом было бы потерей информации).
 *
 * `status` — закрытый перечень, не текст (§11 «state never color-only»):
 * у каждого значения своя иконка, не только цвет. `label`/`lastSyncedLabel`
 * — уже переведённые и отформатированные строки вызывающего кода (метка
 * времени — НЕ Temporal, ТЗ §3/§5: формат даты — дело `packages/i18n` и
 * `packages/app`, этот пакет о времени не знает вообще).
 */
import type { ReactElement } from 'react';

import { Icon } from '../Icon.js';
import './SyncStatus.css';

export type SyncStatusValue = 'synced' | 'syncing' | 'offline' | 'error';

const STATUS_ICON: Record<SyncStatusValue, 'check' | 'sync' | 'circleIncomplete' | 'warning'> = {
  synced: 'check',
  syncing: 'sync',
  offline: 'circleIncomplete',
  error: 'warning',
};

export interface SyncStatusProps {
  readonly status: SyncStatusValue;
  /** Видимый текст статуса («Синхронизировано», «Офлайн», …). */
  readonly label: string;
  /** Метка времени последней синхронизации — уже отформатированная строка
   * вызывающего кода, не рендерится, если не задана (например до первой
   * синхронизации). */
  readonly lastSyncedLabel?: string;
  readonly className?: string;
}

export function SyncStatus({
  status,
  label,
  lastSyncedLabel,
  className,
}: SyncStatusProps): ReactElement {
  return (
    <span
      className={['shagi-sync-status', `shagi-sync-status--${status}`, className]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      <span className="shagi-sync-status__icon" aria-hidden="true">
        <Icon name={STATUS_ICON[status]} size={16} />
      </span>
      <span className="shagi-sync-status__text">
        <span className="shagi-sync-status__label">{label}</span>
        {lastSyncedLabel !== undefined && (
          <span className="shagi-sync-status__timestamp">{lastSyncedLabel}</span>
        )}
      </span>
    </span>
  );
}
