import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BoardCard } from '../../../src/components/organization/index.js';

describe('BoardCard', () => {
  it('рендерит содержимое и опциональный meta-слот (например приоритет/метки)', () => {
    render(
      <BoardCard meta={<span>P2</span>}>
        <span>Подготовить презентацию</span>
      </BoardCard>,
    );
    expect(screen.getByText('Подготовить презентацию')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
  });

  it('без onClick — не кнопка (карточка может быть просто содержимым колонки)', () => {
    render(<BoardCard>Просто карточка</BoardCard>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('с onClick — доступная кнопка, Enter активирует', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <BoardCard onClick={onClick}>
        <span>Открыть задачу</span>
      </BoardCard>,
    );
    const card = screen.getByRole('button', { name: 'Открыть задачу' });
    card.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('dragging — визуальное состояние (компактная карточка на доске, §11 Task.Dragging)', () => {
    render(<BoardCard dragging>Карточка</BoardCard>);
    expect(screen.getByTestId('board-card').className).toMatch(/--dragging/);
  });

  it('selected — структурное отличие через класс', () => {
    render(<BoardCard selected>Карточка</BoardCard>);
    expect(screen.getByTestId('board-card').className).toMatch(/--selected/);
  });
});
