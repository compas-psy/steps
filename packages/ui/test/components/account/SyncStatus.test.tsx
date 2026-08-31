import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SyncStatus } from '../../../src/components/account/index.js';

describe('SyncStatus', () => {
  it('рендерит видимую метку статуса и метку времени последней синхронизации', () => {
    render(<SyncStatus status="synced" label="Синхронизировано" lastSyncedLabel="5 минут назад" />);
    expect(screen.getByText('Синхронизировано')).toBeInTheDocument();
    expect(screen.getByText('5 минут назад')).toBeInTheDocument();
  });

  it('без lastSyncedLabel метка времени не рендерится', () => {
    render(<SyncStatus status="synced" label="Синхронизировано" />);
    expect(screen.queryByText('5 минут назад')).not.toBeInTheDocument();
  });

  it.each([
    ['synced', 'shagi-sync-status--synced'],
    ['syncing', 'shagi-sync-status--syncing'],
    ['offline', 'shagi-sync-status--offline'],
    ['error', 'shagi-sync-status--error'],
  ] as const)('статус %s отражается модификатором класса %s', (status, expectedClass) => {
    const { container } = render(<SyncStatus status={status} label="Статус" />);
    expect(container.querySelector(`.${expectedClass}`)).not.toBeNull();
  });

  it('состояние объявляется как вежливый статус для скринридера (aria-live polite)', () => {
    render(<SyncStatus status="syncing" label="Идёт синхронизация" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('offline и error визуально различимы не только цветом — у каждого статуса своя иконка', () => {
    const { container: offlineContainer } = render(<SyncStatus status="offline" label="Офлайн" />);
    const { container: errorContainer } = render(<SyncStatus status="error" label="Ошибка" />);
    const offlineSvg = offlineContainer.querySelector('svg');
    const errorSvg = errorContainer.querySelector('svg');
    expect(offlineSvg?.outerHTML).not.toEqual(errorSvg?.outerHTML);
  });
});
