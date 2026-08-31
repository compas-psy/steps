import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Filter } from '../../../src/components/organization/index.js';

describe('Filter', () => {
  it('Default — статичный чип, если не задан onClick/selected', () => {
    render(<Filter>Без даты</Filter>);
    expect(screen.getByText('Без даты')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('Selected — переключаемая кнопка с aria-pressed (тот же паттерн, что Chip)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Filter selected onClick={onClick}>
        P1 / Критичные
      </Filter>,
    );
    const btn = screen.getByRole('button', { name: 'P1 / Критичные' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Removable — требует и removeLabel, и onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Filter removable removeLabel="Убрать фильтр «Просрочен срок»" onRemove={onRemove}>
        Просрочен срок
      </Filter>,
    );
    await user.click(screen.getByRole('button', { name: 'Убрать фильтр «Просрочен срок»' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
