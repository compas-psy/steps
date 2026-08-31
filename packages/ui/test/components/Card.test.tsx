import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Card, CardBody, CardHeader } from '../../src/index.js';

describe('Card', () => {
  it('рендерит детей', () => {
    render(
      <Card>
        <CardHeader title="Проект" />
        <CardBody>Содержимое</CardBody>
      </Card>,
    );
    expect(screen.getByText('Проект')).toBeInTheDocument();
    expect(screen.getByText('Содержимое')).toBeInTheDocument();
  });

  it('не интерактивная карточка — обычный div, без role=button', () => {
    render(<Card>Просто карточка</Card>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('interactive — доступная кнопка (role, tabIndex, Enter/Space активируют)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick}>
        Открыть задачу
      </Card>,
    );

    const card = screen.getByRole('button', { name: 'Открыть задачу' });
    expect(card).toHaveAttribute('tabindex', '0');

    card.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('CardHeader принимает декоративную иконку и action', () => {
    render(
      <CardHeader
        title="Заголовок"
        icon={<span>icon</span>}
        action={<button type="button">Действие</button>}
      />,
    );
    expect(screen.getByText('Заголовок')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Действие' })).toBeInTheDocument();
  });
});
