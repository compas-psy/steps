import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UNDO_WINDOW_MS, useUndoToast, type UndoOutcome } from '../../src/state/undo-toast.js';

/**
 * UI-контракт 6-секундного «Отменить» (ST §58). Проверяется поведение, а не
 * вёрстка: сколько живёт предложение, сколько раз уходит обратная мутация,
 * и что видит пользователь при конфликте — потому что именно эти три вещи
 * ломаются молча.
 */
function Harness({ undo }: { readonly undo: () => Promise<UndoOutcome> }): ReactElement {
  const controller = useUndoToast({
    conflict: 'Следующее повторение изменено на другом устройстве — оно сохранено.',
    failed: 'Не удалось отменить.',
  });
  return (
    <div>
      <button
        type="button"
        onClick={() => controller.offerUndo({ message: 'Задача удалена', undo })}
      >
        Удалить
      </button>
      {controller.offer !== null && (
        <div>
          <span>{controller.offer.message}</span>
          <button
            type="button"
            disabled={controller.running}
            onClick={() => void controller.runUndo()}
          >
            Отменить
          </button>
        </div>
      )}
      {controller.notice !== null && <p role="alert">{controller.notice}</p>}
    </div>
  );
}

/** `fireEvent`, а не `userEvent`: последний со своими внутренними задержками
 * на фейковых таймерах виснет, а здесь проверяется именно поведение таймера
 * окна Undo — его подменять нельзя. */
async function click(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

async function setup(undo: () => Promise<UndoOutcome>): Promise<void> {
  render(<Harness undo={undo} />);
  await click('Удалить');
}

describe('useUndoToast — 6-секундное окно «Отменить» (ST §58)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('окно Undo — это ровно 6 секунд из ST §58, а не любое число', () => {
    // Иначе проверка ниже самореферентна: она двигает таймеры на ту же
    // константу, которую использует реализация, и осталась бы зелёной при
    // подмене её на 60 секунд. Найдено ревью пакета работ Undo/Restore R1.
    expect(UNDO_WINDOW_MS).toBe(6_000);
  });

  it('предложение живёт ровно 6 секунд и снимается само', async () => {
    await setup(() => Promise.resolve('ok'));
    expect(screen.getByText('Задача удалена')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    });
    expect(screen.queryByText('Задача удалена')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Задача удалена')).not.toBeInTheDocument();
  });

  it('двойное нажатие применяет инверсию РОВНО один раз и закрывает тост', async () => {
    const undo = vi.fn<() => Promise<UndoOutcome>>(() => Promise.resolve('ok'));
    await setup(undo);

    await act(async () => {
      const button = screen.getByRole('button', { name: 'Отменить' });
      fireEvent.click(button);
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Задача удалена')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('конфликт синхронизации показывается, а не выдаётся за успех', async () => {
    await setup(() => Promise.resolve('conflict'));
    await click('Отменить');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Следующее повторение изменено на другом устройстве — оно сохранено.',
    );
  });

  it('сбой обратной мутации не выдаётся за успех', async () => {
    await setup(() => Promise.reject(new Error('хранилище недоступно')));
    await click('Отменить');

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось отменить.');
  });

  it('медленный откат не гасит НОВОЕ предложение, появившееся за время его выполнения', async () => {
    // Реальный сценарий: откат внутри себя перезапрашивает список и
    // реконсилирует напоминания по каждой задаче — это сотни миллисекунд,
    // и пользователь успевает сделать следующее действие. Безусловное
    // закрытие тоста по завершении старого отката отняло бы у нового его
    // окно Undo. Найдено ревью пакета работ Undo/Restore R1.
    let releaseFirst: ((outcome: UndoOutcome) => void) | null = null;
    const slowUndo = (): Promise<UndoOutcome> =>
      new Promise<UndoOutcome>((resolve) => {
        releaseFirst = resolve;
      });

    render(<Harness undo={slowUndo} />);
    await click('Удалить');
    await click('Отменить');

    // Пока откат A висит, показано предложение B.
    await click('Удалить');
    expect(screen.getByText('Задача удалена')).toBeInTheDocument();

    await act(async () => {
      releaseFirst?.('conflict');
      await Promise.resolve();
    });

    expect(screen.getByText('Задача удалена')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('после истечения окна нажимать нечего — инверсия не уходит', async () => {
    const undo = vi.fn<() => Promise<UndoOutcome>>(() => Promise.resolve('ok'));
    await setup(undo);

    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS);
    });
    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
    expect(undo).not.toHaveBeenCalled();
  });
});
