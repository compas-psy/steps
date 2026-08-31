import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InheritedContextChip } from '../../../src/components/capture/index.js';

describe('InheritedContextChip', () => {
  it('рендерит унаследованное значение как статичный чип', () => {
    render(<InheritedContextChip>Проект: Ремонт</InheritedContextChip>);
    expect(screen.getByText('Проект: Ремонт')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('несёт собственный класс-хук, отличимый от обычного Chip', () => {
    render(<InheritedContextChip>Проект: Ремонт</InheritedContextChip>);
    expect(document.querySelector('.shagi-inherited-context-chip')).toBeInTheDocument();
  });

  it('removable даёт крестик с доступным именем и вызывает onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <InheritedContextChip removable removeLabel="Не наследовать проект" onRemove={onRemove}>
        Проект: Ремонт
      </InheritedContextChip>,
    );

    const removeButton = screen.getByRole('button', { name: 'Не наследовать проект' });
    await user.click(removeButton);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
