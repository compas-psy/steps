import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar, type SidebarSection } from '../../../src/components/navigation/index.js';

const SECTIONS: readonly SidebarSection[] = [
  {
    key: 'primary',
    items: [
      { value: 'today', label: 'Сегодня', icon: 'moveToToday' },
      { value: 'plan', label: 'План', icon: 'calendar' },
      { value: 'inbox', label: 'Входящие', icon: 'inbox', badge: '3' },
    ],
  },
  {
    key: 'projects',
    title: 'Проекты',
    items: [{ value: 'project-1', label: 'Ремонт кухни', icon: 'folder' }],
  },
  {
    key: 'archive',
    items: [{ value: 'completed', label: 'Завершённые', muted: true, disabled: false }],
  },
];

function ControlledSidebar({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('today');
  return (
    <Sidebar
      sections={SECTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      label="Разделы приложения"
    />
  );
}

describe('Sidebar', () => {
  it('рендерится как nav-лендмарк с доступным именем и всеми пунктами секций', () => {
    render(<ControlledSidebar />);
    expect(screen.getByRole('navigation', { name: 'Разделы приложения' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сегодня/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ремонт кухни/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Завершённые/ })).toBeInTheDocument();
  });

  it('заголовок секции виден как текст', () => {
    render(<ControlledSidebar />);
    expect(screen.getByText('Проекты')).toBeInTheDocument();
  });

  it('активный пункт помечен aria-current="page" и структурно отличается (свой класс)', () => {
    render(<ControlledSidebar />);
    const today = screen.getByRole('button', { name: /Сегодня/ });
    expect(today).toHaveAttribute('aria-current', 'page');
    expect(today.className).toMatch(/--active/);
    expect(screen.getByRole('button', { name: /План/ })).not.toHaveAttribute('aria-current');
  });

  it('клик по пункту вызывает onChange со значением пункта', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledSidebar onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /Ремонт кухни/ }));

    expect(onChange).toHaveBeenCalledWith('project-1');
  });

  it('badge и приглушённый пункт видны без потери роли/имени', () => {
    render(<ControlledSidebar />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Завершённые/ }).className).toMatch(/--muted/);
  });

  it('все пункты достижимы клавиатурой по обычному tab-порядку', async () => {
    const user = userEvent.setup();
    render(<ControlledSidebar />);

    await user.tab();
    expect(screen.getByRole('button', { name: /Сегодня/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /План/ })).toHaveFocus();
  });
});
