import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectRow } from '../../../src/components/organization/index.js';

describe('ProjectRow', () => {
  it('рендерит название и счётчик задач', () => {
    render(
      <ul>
        <ProjectRow name="Работа" taskCount={5} />
      </ul>,
    );
    expect(screen.getByRole('button', { name: /Работа/ })).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('клик вызывает onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ul>
        <ProjectRow name="Дом" onClick={onClick} />
      </ul>,
    );
    await user.click(screen.getByRole('button', { name: 'Дом' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('маркер цвета — контролируемый enum, применяется как класс', () => {
    render(
      <ul>
        <ProjectRow name="Личное" color="violet" />
      </ul>,
    );
    const marker = screen.getByTestId('project-row-marker');
    expect(marker.className).toMatch(/--violet/);
  });

  it('по умолчанию маркер forest (§4.1 «Default forest»)', () => {
    render(
      <ul>
        <ProjectRow name="Без цвета" />
      </ul>,
    );
    expect(screen.getByTestId('project-row-marker').className).toMatch(/--forest/);
  });

  it('selected — структурное отличие через класс, не только цвет', () => {
    render(
      <ul>
        <ProjectRow name="Работа" selected />
      </ul>,
    );
    expect(screen.getByRole('button', { name: 'Работа' }).className).toMatch(/--selected/);
  });

  it('dragging — визуальное состояние через класс на элементе списка', () => {
    render(
      <ul>
        <ProjectRow name="Работа" dragging />
      </ul>,
    );
    expect(screen.getByRole('listitem').className).toMatch(/--dragging/);
  });

  it('draggable прокидывает нативные drag-обработчики наружу, не реализует reorder сам', async () => {
    const onDragStart = vi.fn();
    render(
      <ul>
        <ProjectRow name="Работа" draggable onDragStart={onDragStart} />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute('draggable', 'true');
  });

  it('disabled — кнопка недоступна для клика', () => {
    render(
      <ul>
        <ProjectRow name="Архивный" disabled onClick={vi.fn()} />
      </ul>,
    );
    expect(screen.getByRole('button', { name: 'Архивный' })).toBeDisabled();
  });
});
