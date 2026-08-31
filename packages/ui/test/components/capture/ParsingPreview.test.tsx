import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ParsingPreview, type ParsingPreviewToken } from '../../../src/components/capture/index.js';

describe('ParsingPreview', () => {
  it('область — region с доступным именем, показывает очищенный заголовок', () => {
    render(<ParsingPreview title="Купить молоко" tokens={[]} label="Предпросмотр разбора" />);
    const region = screen.getByRole('region', { name: 'Предпросмотр разбора' });
    expect(region).toHaveTextContent('Купить молоко');
  });

  it('рендерит переданные токены как NLPToken с их kind', () => {
    const tokens: readonly ParsingPreviewToken[] = [
      { id: '1', kind: 'date', label: 'завтра' },
      { id: '2', kind: 'time', label: '09:00' },
    ];
    render(<ParsingPreview title="Купить молоко" tokens={tokens} label="Предпросмотр разбора" />);

    expect(document.querySelector('.shagi-nlp-token--date')).toHaveTextContent('завтра');
    expect(document.querySelector('.shagi-nlp-token--time')).toHaveTextContent('09:00');
  });

  it('removable-токен вызывает свой onRemove независимо от соседних', async () => {
    const user = userEvent.setup();
    const onRemoveDate = vi.fn();
    const onRemoveTime = vi.fn();
    const tokens: readonly ParsingPreviewToken[] = [
      {
        id: '1',
        kind: 'date',
        label: 'завтра',
        removable: true,
        removeLabel: 'Убрать дату',
        onRemove: onRemoveDate,
      },
      {
        id: '2',
        kind: 'time',
        label: '09:00',
        removable: true,
        removeLabel: 'Убрать время',
        onRemove: onRemoveTime,
      },
    ];
    render(<ParsingPreview title="Купить молоко" tokens={tokens} label="Предпросмотр разбора" />);

    await user.click(screen.getByRole('button', { name: 'Убрать время' }));
    expect(onRemoveTime).toHaveBeenCalledTimes(1);
    expect(onRemoveDate).not.toHaveBeenCalled();
  });

  it('без токенов показывает emptyState, если он передан', () => {
    render(
      <ParsingPreview
        title=""
        tokens={[]}
        label="Предпросмотр разбора"
        emptyState={<span>Начните вводить задачу</span>}
      />,
    );
    expect(screen.getByText('Начните вводить задачу')).toBeInTheDocument();
  });
});
