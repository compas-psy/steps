import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BoardColumn } from '../../../src/components/organization/index.js';

describe('BoardColumn', () => {
  it('рендерит заголовок, счётчик и содержимое (карточки приходят через children)', () => {
    render(
      <BoardColumn title="Сделать" count={2}>
        <div>Написать ТЗ</div>
      </BoardColumn>,
    );
    expect(screen.getByText('Сделать')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Написать ТЗ')).toBeInTheDocument();
  });

  it('пустая колонка рендерится без карточек, но с заголовком (Финал · 0)', () => {
    render(<BoardColumn title="Финал" count={0} />);
    expect(screen.getByText('Финал')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('isDropTarget — визуальный класс для drop-цели, компонент не считает reorder сам', () => {
    render(
      <BoardColumn title="В работе" isDropTarget>
        <div>Карточка</div>
      </BoardColumn>,
    );
    expect(screen.getByTestId('board-column').className).toMatch(/--drop-target/);
  });
});
