import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Breadcrumb, type BreadcrumbItem } from '../../../src/components/navigation/index.js';

const ITEMS: readonly BreadcrumbItem[] = [
  { value: 'projects', label: 'Проекты' },
  { value: 'renovation', label: 'Ремонт кухни' },
  { value: 'section', label: 'Электрика' },
];

describe('Breadcrumb', () => {
  it('рендерится как nav-лендмарк с доступным именем', () => {
    render(<Breadcrumb items={ITEMS} onSelect={vi.fn()} label="Хлебная крошка" />);
    expect(screen.getByRole('navigation', { name: 'Хлебная крошка' })).toBeInTheDocument();
  });

  it('промежуточные пункты — кликабельные кнопки, последний — текущая страница', () => {
    render(<Breadcrumb items={ITEMS} onSelect={vi.fn()} label="Хлебная крошка" />);

    expect(screen.getByRole('button', { name: 'Проекты' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ремонт кухни' })).toBeInTheDocument();

    const current = screen.getByText('Электрика');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Электрика' })).not.toBeInTheDocument();
  });

  it('клик по промежуточному пункту вызывает onSelect с его значением', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Breadcrumb items={ITEMS} onSelect={onSelect} label="Хлебная крошка" />);

    await user.click(screen.getByRole('button', { name: 'Ремонт кухни' }));

    expect(onSelect).toHaveBeenCalledWith('renovation');
  });

  it('доступна клавиатурой по обычному tab-порядку (текущая страница не в tab-порядке)', async () => {
    const user = userEvent.setup();
    render(<Breadcrumb items={ITEMS} onSelect={vi.fn()} label="Хлебная крошка" />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Проекты' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ремонт кухни' })).toHaveFocus();
  });
});
