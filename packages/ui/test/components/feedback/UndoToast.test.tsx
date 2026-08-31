import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UndoToast } from '../../../src/components/feedback/index.js';

describe('UndoToast', () => {
  it('ни message, ни actionLabel не хардкожены — приходят пропсами', () => {
    render(<UndoToast message="Задача выполнена" actionLabel="Отменить" onAction={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Задача выполнена');
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  });

  it('клик по действию вызывает onAction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<UndoToast message="Задача выполнена" actionLabel="Отменить" onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('role=status/aria-live=polite — вежливый анонс', () => {
    render(<UndoToast message="Готово" actionLabel="Отменить" onAction={() => {}} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
