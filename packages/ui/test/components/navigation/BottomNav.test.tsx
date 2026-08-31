import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { BottomNav, type BottomNavItem } from '../../../src/components/navigation/index.js';

const ITEMS: readonly BottomNavItem[] = [
  { value: 'today', label: 'Сегодня', icon: 'moveToToday' },
  { value: 'plan', label: 'План', icon: 'calendar' },
  { value: 'projects', label: 'Проекты', icon: 'folder' },
  { value: 'search', label: 'Поиск', icon: 'search' },
];

function ControlledBottomNav({
  onChange,
  onAdd,
}: {
  onChange?: (value: string) => void;
  onAdd?: () => void;
}) {
  const [value, setValue] = useState('today');
  return (
    <BottomNav
      items={ITEMS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      centerAction={{ icon: 'add', label: 'Быстрое добавление', onClick: onAdd ?? (() => {}) }}
      label="Основная навигация"
    />
  );
}

describe('BottomNav', () => {
  it('рендерится как nav-лендмарк с доступным именем и пунктами', () => {
    render(<ControlledBottomNav />);
    expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сегодня' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'План' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Проекты' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Поиск' })).toBeInTheDocument();
  });

  it('активный пункт помечен aria-current="page", остальные — нет', () => {
    render(<ControlledBottomNav />);
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'План' })).not.toHaveAttribute('aria-current');
  });

  it('активное состояние различимо не только цветом — есть отдельный CSS-класс', () => {
    render(<ControlledBottomNav />);
    const today = screen.getByRole('button', { name: 'Сегодня' });
    const plan = screen.getByRole('button', { name: 'План' });
    expect(today.className).toMatch(/--active/);
    expect(plan.className).not.toMatch(/--active/);
  });

  it('клик по боковому пункту переключает активный и вызывает onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledBottomNav onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Проекты' }));

    expect(onChange).toHaveBeenCalledWith('projects');
    expect(screen.getByRole('button', { name: 'Проекты' })).toHaveAttribute('aria-current', 'page');
  });

  it('центральная кнопка имеет обязательное доступное имя и вызывает свой onClick, не onChange', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onChange = vi.fn();
    render(<ControlledBottomNav onChange={onChange} onAdd={onAdd} />);

    const center = screen.getByRole('button', { name: 'Быстрое добавление' });
    await user.click(center);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('все пункты достижимы клавиатурой по обычному tab-порядку', async () => {
    const user = userEvent.setup();
    render(<ControlledBottomNav />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Сегодня' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'План' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Быстрое добавление' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Проекты' })).toHaveFocus();
  });
});
