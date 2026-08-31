import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Section } from '../../../src/components/organization/index.js';

describe('Section', () => {
  it('рендерит название и счётчик задач в секции', () => {
    render(<Section title="Идеи" count={3} />);
    expect(screen.getByText('Идеи')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('без onToggleCollapse — статичный заголовок, не кнопка', () => {
    render(<Section title="Без раздела" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('с onToggleCollapse — интерактивная кнопка с aria-expanded', async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();
    render(<Section title="Сделать" onToggleCollapse={onToggleCollapse} collapsed={false} />);
    const toggle = screen.getByRole('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('collapsed=true отражается в aria-expanded=false', () => {
    render(<Section title="Финал" onToggleCollapse={vi.fn()} collapsed />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });
});
