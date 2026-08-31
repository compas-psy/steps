import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SubtaskRow } from '../../../src/components/task/index.js';

describe('SubtaskRow', () => {
  it('рендерит заголовок и чекбокс подзадачи с доступным именем', () => {
    render(<SubtaskRow title="Забронировать столик" checked={false} checkboxLabel="Забронировать столик" />);
    expect(screen.getByText('Забронировать столик')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Забронировать столик' })).toBeInTheDocument();
  });

  it('несёт компактный модификатор-класс сверх состояний TaskRow', () => {
    const { container } = render(
      <SubtaskRow title="Задача" checked={false} checkboxLabel="Задача" state="deadlineMissed" />,
    );
    expect(container.querySelector('.shagi-subtask-row')).toBeInTheDocument();
    expect(container.querySelector('.shagi-task-row--deadlineMissed')).toBeInTheDocument();
  });
});
