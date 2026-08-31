import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Loading } from '../../../src/components/feedback/index.js';

describe('Loading', () => {
  it('с видимым текстом — role=status на обёртке, ровно один такой регион', () => {
    render(<Loading>Загрузка задач…</Loading>);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent('Загрузка задач…');
  });

  it('без видимого текста — доступное имя из label через Spinner, без дублирующего региона', () => {
    render(<Loading label="Загрузка" />);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAccessibleName('Загрузка');
  });

  it('переиспользует Spinner (не рисует свою анимацию заново)', () => {
    const { container } = render(<Loading label="Загрузка" />);
    expect(container.querySelector('.shagi-spinner')).toBeInTheDocument();
  });
});
