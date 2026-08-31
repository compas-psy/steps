import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from '../../../src/components/feedback/index.js';

describe('EmptyState', () => {
  it('title/description/action — пропсы, не хардкод; иконка декоративна', () => {
    render(
      <EmptyState
        icon={<svg aria-hidden="true" />}
        title="На сегодня всё"
        description="Новые задачи появятся здесь"
        action={<button type="button">Добавить задачу</button>}
      />,
    );
    expect(screen.getByText('На сегодня всё')).toBeInTheDocument();
    expect(screen.getByText('Новые задачи появятся здесь')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Добавить задачу' })).toBeInTheDocument();
  });

  it('description и action необязательны', () => {
    render(<EmptyState title="Пусто" />);
    expect(screen.getByText('Пусто')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
