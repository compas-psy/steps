import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Tooltip } from '../../src/index.js';

describe('Tooltip', () => {
  it('триггер связан с содержимым подсказки через aria-describedby с самого начала', () => {
    render(
      <Tooltip content="Удалить задачу безвозвратно">
        <button type="button">Удалить</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Удалить' });
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const bubble = document.getElementById(describedBy!);
    expect(bubble).toHaveAttribute('role', 'tooltip');
    expect(bubble).toHaveTextContent('Удалить задачу безвозвратно');
  });

  it('открывается по фокусу и закрывается по Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Подсказка">
        <button type="button">Триггер</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', { name: 'Триггер' });
    const bubble = screen.getByRole('tooltip', { hidden: true });
    expect(bubble.className).not.toMatch(/--open/);

    await user.tab();
    expect(trigger).toHaveFocus();
    expect(bubble.className).toMatch(/--open/);

    await user.keyboard('{Escape}');
    expect(bubble.className).not.toMatch(/--open/);
  });

  it('исходный обработчик триггера (onFocus) продолжает вызываться', async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    render(
      <Tooltip content="Подсказка">
        <button type="button" onFocus={onFocus}>
          Триггер
        </button>
      </Tooltip>,
    );

    await user.tab();
    expect(onFocus).toHaveBeenCalledTimes(1);
  });
});
