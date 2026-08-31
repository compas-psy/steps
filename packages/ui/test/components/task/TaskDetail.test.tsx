import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskDetail } from '../../../src/components/task/index.js';

describe('TaskDetail', () => {
  it('всегда рендерит header, остальные слоты — только когда заданы', () => {
    render(<TaskDetail header={<h1>Заголовок задачи</h1>} />);
    expect(screen.getByText('Заголовок задачи')).toBeInTheDocument();
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });

  it('рендерит все слоты и разделители между секциями subtasks/checklist/actions', () => {
    render(
      <TaskDetail
        header={<h1>Задача</h1>}
        metadata={<div>27 авг · Проект «Дом»</div>}
        subtasks={<div>Подзадача 1</div>}
        checklist={<div>Пункт чек-листа</div>}
        actions={<button type="button">Удалить</button>}
      />,
    );
    expect(screen.getByText('Задача')).toBeInTheDocument();
    expect(screen.getByText('27 авг · Проект «Дом»')).toBeInTheDocument();
    expect(screen.getByText('Подзадача 1')).toBeInTheDocument();
    expect(screen.getByText('Пункт чек-листа')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
    // metadata без разделителя (часть верхнего блока), subtasks/checklist/actions — по одному.
    expect(screen.getAllByRole('separator')).toHaveLength(3);
  });
});
