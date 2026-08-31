import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DraftIndicator } from '../../../src/components/capture/index.js';

describe('DraftIndicator', () => {
  it('доступное имя обязателен через label, роль polite-статуса (образец SyncState)', () => {
    render(<DraftIndicator label="Есть несохранённый черновик" />);
    const indicator = screen.getByRole('status', { name: 'Есть несохранённый черновик' });
    expect(indicator).toHaveAttribute('aria-live', 'polite');
  });

  it('визуальная точка декоративна (aria-hidden), не дублирует доступное имя', () => {
    render(<DraftIndicator label="Есть несохранённый черновик" />);
    const dot = document.querySelector('.shagi-draft-indicator__dot');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });
});
