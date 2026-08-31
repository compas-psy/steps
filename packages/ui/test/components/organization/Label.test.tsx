import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Label } from '../../../src/components/organization/index.js';

describe('Label', () => {
  it('рендерит название метки как обычный span, без маркера, если color не задан', () => {
    render(<Label>презентации</Label>);
    expect(screen.getByText('презентации')).toBeInTheDocument();
    expect(screen.queryByTestId('label-marker')).not.toBeInTheDocument();
  });

  it('color — опциональный контролируемый маркер (§4.1 палитра, не произвольный цвет)', () => {
    render(<Label color="blue">работа</Label>);
    expect(screen.getByTestId('label-marker').className).toMatch(/--blue/);
  });

  it('без onClick — статичный, не button', () => {
    render(<Label>статика</Label>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('onClick/selected — переключаемая кнопка (тот же паттерн, что Chip)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Label selected onClick={onClick}>
        срочно
      </Label>,
    );
    const btn = screen.getByRole('button', { name: 'срочно' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await user.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('removable требует и removeLabel, и onRemove (доступное имя для ×)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Label removable removeLabel="Убрать метку «срочно»" onRemove={onRemove}>
        срочно
      </Label>,
    );
    await user.click(screen.getByRole('button', { name: 'Убрать метку «срочно»' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
