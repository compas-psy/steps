import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TaskRow, type TaskRowState } from '../../../src/components/task/index.js';

describe('TaskRow', () => {
  it('рендерит заголовок и чекбокс с доступным именем', () => {
    render(<TaskRow title="Купить билеты" checked={false} checkboxLabel="Купить билеты" />);
    expect(screen.getByText('Купить билеты')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Купить билеты' })).toBeInTheDocument();
  });

  it('checked чекбокса переключается кликом и вызывает onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(
      <TaskRow
        title="Задача"
        checked={false}
        checkboxLabel="Задача"
        onCheckedChange={onCheckedChange}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Задача' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('statusLabel и metadata рендерятся во второй строке', () => {
    render(
      <TaskRow
        title="Задача"
        checked={false}
        checkboxLabel="Задача"
        statusLabel="до 27 авг"
        metadata={<span>Проект «Дом»</span>}
      />,
    );
    expect(screen.getByText('до 27 авг')).toBeInTheDocument();
    expect(screen.getByText('Проект «Дом»')).toBeInTheDocument();
  });

  it('trailing-слот рендерится (например меню действий)', () => {
    render(
      <TaskRow
        title="Задача"
        checked={false}
        checkboxLabel="Задача"
        trailing={<button type="button">Действия</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Действия' })).toBeInTheDocument();
  });

  describe('девять состояний визуально различимы не только цветом', () => {
    it('normal — базовое состояние, без дополнительных маркеров', () => {
      const { container } = render(
        <TaskRow title="Задача" checked={false} checkboxLabel="Задача" state="normal" />,
      );
      expect(container.querySelector('.shagi-task-row--normal')).toBeInTheDocument();
      expect(container.querySelector('.shagi-focus-marker')).not.toBeInTheDocument();
      expect(container.querySelector('.shagi-task-row__state-icon')).not.toBeInTheDocument();
      expect(container.querySelector('.shagi-task-row__drag-handle')).not.toBeInTheDocument();
    });

    it('focus — точка-маркер FocusMarker в DOM + aria-current на строке', () => {
      const { container } = render(
        <TaskRow title="Задача" checked={false} checkboxLabel="Задача" state="focus" />,
      );
      expect(container.querySelector('.shagi-focus-marker')).toBeInTheDocument();
      expect(container.querySelector('.shagi-task-row--focus')).toHaveAttribute(
        'aria-current',
        'true',
      );
    });

    it('missedPlan — часы-иконка рядом с заголовком (не только цвет фона)', () => {
      const { container } = render(
        <TaskRow title="Задача" checked={false} checkboxLabel="Задача" state="missedPlan" />,
      );
      const icon = container.querySelector('.shagi-task-row__state-icon');
      expect(icon).toBeInTheDocument();
      expect(icon?.querySelector('svg')).toBeInTheDocument();
    });

    it('deadlineSoon — своя иконка, отличная от missedPlan/deadlineMissed', () => {
      const missed = render(
        <TaskRow title="A" checked={false} checkboxLabel="A" state="missedPlan" />,
      );
      const soon = render(
        <TaskRow title="B" checked={false} checkboxLabel="B" state="deadlineSoon" />,
      );
      const missedIcon = missed.container.querySelector(
        '.shagi-task-row__state-icon svg',
      )?.outerHTML;
      const soonIcon = soon.container.querySelector('.shagi-task-row__state-icon svg')?.outerHTML;
      expect(soonIcon).toBeTruthy();
      expect(soonIcon).not.toBe(missedIcon);
    });

    it('deadlineMissed — усиленный «!»-бейдж (иконка overdue) + подпись статуса', () => {
      const { container } = render(
        <TaskRow
          title="Задача"
          checked={false}
          checkboxLabel="Задача"
          state="deadlineMissed"
          statusLabel="просрочено 27 авг"
        />,
      );
      expect(container.querySelector('.shagi-task-row__state-icon svg')).toBeInTheDocument();
      expect(screen.getByText('просрочено 27 авг')).toBeInTheDocument();
    });

    it('recurring — иконка повтора рядом с заголовком', () => {
      const { container } = render(
        <TaskRow title="Задача" checked={false} checkboxLabel="Задача" state="recurring" />,
      );
      expect(container.querySelector('.shagi-task-row__state-icon svg')).toBeInTheDocument();
    });

    it('completed — модификатор-класс зачёркивания заголовка (структурный сигнал, не только цвет) + checked чекбокс', () => {
      const { container } = render(
        <TaskRow title="Задача" checked checkboxLabel="Задача" state="completed" />,
      );
      // `--completed` в CSS зачёркивает `.shagi-task-row__title` (line-through) —
      // здесь проверяется, что структура (класс модификатора над заголовком)
      // на месте; сама раскраска CSS не рендерится в тестовом окружении
      // (vitest не подключает `.css` при `css: false` по умолчанию).
      expect(
        container.querySelector('.shagi-task-row--completed .shagi-task-row__title'),
      ).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Задача' })).toBeChecked();
    });

    it('selected — фон + принудительно заполненный чекбокс, aria-selected на строке', () => {
      const { container } = render(
        <TaskRow title="Задача" checked={false} checkboxLabel="Задача" state="selected" />,
      );
      expect(container.querySelector('.shagi-task-row--selected')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      // Заливка чекбокса форсируется CSS-классом строки — сам чекбокс не checked.
      expect(screen.getByRole('checkbox', { name: 'Задача' })).not.toBeChecked();
      expect(
        container.querySelector('.shagi-task-row--selected .shagi-task-checkbox__box'),
      ).toBeInTheDocument();
    });

    it('dragging — виден drag-handle, отличный от простого снижения непрозрачности', () => {
      const { container } = render(
        <TaskRow title="Задача" checked={false} checkboxLabel="Задача" state="dragging" />,
      );
      expect(container.querySelector('.shagi-task-row__drag-handle svg')).toBeInTheDocument();
    });

    it('каждое состояние получает собственный модификатор-класс строки', () => {
      const states: readonly TaskRowState[] = [
        'normal',
        'focus',
        'missedPlan',
        'deadlineSoon',
        'deadlineMissed',
        'recurring',
        'completed',
        'selected',
        'dragging',
      ];
      for (const state of states) {
        const { container } = render(
          <TaskRow title="Задача" checked={false} checkboxLabel="Задача" state={state} />,
        );
        expect(container.querySelector(`.shagi-task-row--${state}`)).toBeInTheDocument();
      }
    });
  });

  it('disabled прокидывается в TaskCheckbox', () => {
    render(<TaskRow title="Задача" checked={false} checkboxLabel="Задача" disabled />);
    expect(screen.getByRole('checkbox', { name: 'Задача' })).toBeDisabled();
  });
});
