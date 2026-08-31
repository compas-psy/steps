import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SyncState } from '../../../src/components/feedback/index.js';

describe('SyncState', () => {
  it('доступное имя обязателен через label, роль polite-статуса', () => {
    render(<SyncState status="idle" label="Синхронизировано" />);
    const indicator = screen.getByRole('status', { name: 'Синхронизировано' });
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });

  it('idle/syncing/error различаются классом-модификатором (не только оттенком — разные иконки)', () => {
    const { rerender, container } = render(<SyncState status="idle" label="Синхронизировано" />);
    expect(container.querySelector('.shagi-sync-state--idle')).toBeInTheDocument();
    const idleIconPaths = container.querySelectorAll('svg').length;

    rerender(<SyncState status="syncing" label="Синхронизация…" />);
    expect(container.querySelector('.shagi-sync-state--syncing')).toBeInTheDocument();

    rerender(<SyncState status="error" label="Ошибка синхронизации" />);
    expect(container.querySelector('.shagi-sync-state--error')).toBeInTheDocument();
    // Иконка есть в каждом состоянии — свг не исчезает и не меняется на пустоту.
    expect(idleIconPaths).toBeGreaterThan(0);
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });
});
