import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DateChip,
  DeadlineChip,
  DurationChip,
  ReminderChip,
  RecurrenceChip,
  TimeChip,
} from '../../../src/components/planning/index.js';

describe('чипы планирования — тонкие обёртки над Chip', () => {
  it('DateChip рендерит переданный label как текст статичного чипа', () => {
    render(<DateChip label="31 августа" />);
    expect(screen.getByText('31 августа')).toBeInTheDocument();
  });

  it('TimeChip/DurationChip/DeadlineChip/ReminderChip/RecurrenceChip рендерят свой label', () => {
    render(
      <>
        <TimeChip label="09:00" />
        <DurationChip label="45 мин" />
        <DeadlineChip label="До пятницы" />
        <ReminderChip label="За час" />
        <RecurrenceChip label="Каждый день" />
      </>,
    );
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('45 мин')).toBeInTheDocument();
    expect(screen.getByText('До пятницы')).toBeInTheDocument();
    expect(screen.getByText('За час')).toBeInTheDocument();
    expect(screen.getByText('Каждый день')).toBeInTheDocument();
  });

  it('без onClick/selected — статичный <span>, не кнопка (переиспользует три формы Chip как есть)', () => {
    render(<DateChip label="31 августа" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('selected переключает чип в переключаемую кнопку с aria-pressed (форма Chip, не переизобретена)', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DeadlineChip label="До пятницы" selected={false} onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'До пятницы' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('removable требует removeLabel/onRemove (дискриминация Chip сохранена через DistributiveOmit) и рендерит крестик', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <RecurrenceChip
        label="Каждый день"
        removable
        removeLabel="Убрать повтор"
        onRemove={onRemove}
      />,
    );

    const removeButton = screen.getByRole('button', { name: 'Убрать повтор' });
    await user.click(removeButton);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('чипы не форматируют дату/время сами — label приходит готовой строкой без изменений', () => {
    render(<TimeChip label="RAW-LABEL-9000" />);
    expect(screen.getByText('RAW-LABEL-9000')).toBeInTheDocument();
  });
});
