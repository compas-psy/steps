import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectHeader } from '../../../src/components/organization/index.js';

const SECTIONS = [
  {
    key: 'primary',
    items: [{ key: 'archive', label: 'Архивировать', icon: 'archive' as const }],
  },
];

describe('ProjectHeader', () => {
  it('рендерит название и счётчик задач', () => {
    render(
      <ProjectHeader
        title="Работа"
        count={12}
        menuOpen={false}
        onMenuOpenChange={vi.fn()}
        menuSections={SECTIONS}
        menuLabel="Действия с проектом"
        triggerLabel="Открыть меню проекта"
      />,
    );
    expect(screen.getByText('Работа')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('кнопка меню имеет обязательное доступное имя и открывает Menu по клику', async () => {
    const user = userEvent.setup();
    const onMenuOpenChange = vi.fn();
    render(
      <ProjectHeader
        title="Работа"
        menuOpen={false}
        onMenuOpenChange={onMenuOpenChange}
        menuSections={SECTIONS}
        menuLabel="Действия с проектом"
        triggerLabel="Открыть меню проекта"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Открыть меню проекта' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(trigger);
    expect(onMenuOpenChange).toHaveBeenCalledWith(true);
  });

  it('menuOpen=true рендерит Menu (тонкая обёртка, не своя реализация) с переданными пунктами', () => {
    render(
      <ProjectHeader
        title="Работа"
        menuOpen
        onMenuOpenChange={vi.fn()}
        menuSections={SECTIONS}
        menuLabel="Действия с проектом"
        triggerLabel="Открыть меню проекта"
      />,
    );
    expect(screen.getByRole('menu', { name: 'Действия с проектом' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Архивировать' })).toBeInTheDocument();
  });

  it('слот actions рендерит дополнительные действия рядом с меню', () => {
    render(
      <ProjectHeader
        title="Работа"
        menuOpen={false}
        onMenuOpenChange={vi.fn()}
        menuSections={SECTIONS}
        menuLabel="Действия с проектом"
        triggerLabel="Открыть меню проекта"
        actions={<button type="button">Экспорт</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Экспорт' })).toBeInTheDocument();
  });
});
