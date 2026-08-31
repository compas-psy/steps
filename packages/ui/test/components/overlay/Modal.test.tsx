import { type ReactElement, useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Modal } from '../../../src/components/overlay/index.js';

/**
 * Обёртка с реальным триггером — без неё нельзя проверить «фокус
 * возвращается на элемент, который открыл модалку» (задание): нужен
 * элемент, у которого был фокус ДО открытия.
 */
function ModalHarness(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть модалку
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Заголовок диалога">
        <button type="button">Первая</button>
        <button type="button">Вторая</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('не рендерится, пока open=false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Скрыт">
        Содержимое
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('открытый диалог имеет доступную роль и имя из title', () => {
    render(
      <Modal open onClose={() => {}} title="Заголовок диалога">
        Содержимое
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Заголовок диалога' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('настоящий фокус-trap: открытие переносит фокус внутрь, Tab циклится, Escape закрывает, фокус возвращается на триггер', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: 'Открыть модалку' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Заголовок диалога' });
    const first = screen.getByRole('button', { name: 'Первая' });
    const second = screen.getByRole('button', { name: 'Вторая' });

    // Открытие переносит фокус на первый фокусируемый элемент диалога.
    expect(first).toHaveFocus();

    // Tab доходит до конца списка фокусируемых элементов диалога.
    await user.tab();
    expect(second).toHaveFocus();

    // Ещё один Tab с последнего элемента обязан вернуть фокус к началу
    // диалога, а не выпустить его наружу (в фон/трigger/body).
    await user.tab();
    expect(first).toHaveFocus();
    expect(document.activeElement).not.toBe(trigger);
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Shift+Tab с первого элемента обязан зациклить в обратную сторону.
    await user.tab({ shift: true });
    expect(second).toHaveFocus();

    // Escape закрывает диалог...
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // ...и возвращает фокус на элемент, который его открыл.
    expect(trigger).toHaveFocus();
  });

  it('клик по фону (не по самому диалогу) закрывает модалку', async () => {
    const user = userEvent.setup();
    let closed = false;
    const { container } = render(
      <Modal open onClose={() => (closed = true)} title="Заголовок">
        Содержимое
      </Modal>,
    );
    const overlay = container.querySelector('.shagi-modal-overlay') as HTMLElement;
    await user.click(overlay);
    expect(closed).toBe(true);
  });

  it('без title доступное имя приходит из aria-label', () => {
    render(
      <Modal open onClose={() => {}} aria-label="Диалог без видимого заголовка">
        Содержимое
      </Modal>,
    );
    expect(
      screen.getByRole('dialog', { name: 'Диалог без видимого заголовка' }),
    ).toBeInTheDocument();
  });
});
