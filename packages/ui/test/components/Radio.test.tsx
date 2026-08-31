import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Radio } from '../../src/index.js';

describe('Radio', () => {
  it('видимый label связан с полем через нативный <label>', () => {
    render(<Radio name="priority" value="high" label="Высокий" />);
    expect(screen.getByRole('radio', { name: 'Высокий' })).toBeInTheDocument();
  });

  it('в группе одновременно выбран только один вариант', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Radio name="priority" value="low" label="Низкий" defaultChecked />
        <Radio name="priority" value="high" label="Высокий" />
      </div>,
    );

    const low = screen.getByRole('radio', { name: 'Низкий' });
    const high = screen.getByRole('radio', { name: 'Высокий' });
    expect(low).toBeChecked();

    await user.click(high);
    expect(high).toBeChecked();
    expect(low).not.toBeChecked();
  });

  it('disabled — недоступен для взаимодействия', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Radio name="priority" value="low" label="Недоступно" disabled onChange={onChange} />);

    const radio = screen.getByRole('radio', { name: 'Недоступно' });
    expect(radio).toBeDisabled();

    await user.click(radio);
    expect(onChange).not.toHaveBeenCalled();
  });
});
