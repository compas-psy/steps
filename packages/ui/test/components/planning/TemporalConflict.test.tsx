import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TemporalConflict } from '../../../src/components/planning/index.js';

describe('TemporalConflict', () => {
  it('role=alert, показывает уже готовое сообщение и тип конфликта через data-атрибут', () => {
    render(
      <TemporalConflict type="plannedAfterDeadline" message="Дата планирования позже срока" />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Дата планирования позже срока');
    expect(alert).toHaveAttribute('data-conflict-type', 'plannedAfterDeadline');
  });

  it('разные типы конфликта отражаются в data-conflict-type, сообщение — всегда переданный пропс, не хардкод', () => {
    const { rerender } = render(
      <TemporalConflict type="durationCrossesDeadline" message="Длительность выходит за срок" />,
    );
    expect(screen.getByRole('alert')).toHaveAttribute(
      'data-conflict-type',
      'durationCrossesDeadline',
    );
    expect(screen.getByText('Длительность выходит за срок')).toBeInTheDocument();

    rerender(<TemporalConflict type="reminderAfterDeadline" message="Напоминание позже срока" />);
    expect(screen.getByRole('alert')).toHaveAttribute(
      'data-conflict-type',
      'reminderAfterDeadline',
    );
    expect(screen.getByText('Напоминание позже срока')).toBeInTheDocument();
  });
});
