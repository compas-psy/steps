import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DataPrivacyRow } from '../../../src/components/account/index.js';

describe('DataPrivacyRow', () => {
  it('рендерит заголовок и описание', () => {
    render(
      <DataPrivacyRow
        title="Экспорт данных"
        description="Скачать копию всех задач в формате JSON"
        action={{ kind: 'none' }}
      />,
    );
    expect(screen.getByText('Экспорт данных')).toBeInTheDocument();
    expect(screen.getByText('Скачать копию всех задач в формате JSON')).toBeInTheDocument();
  });

  it('action="switch" рендерит переключатель с переданным состоянием', () => {
    render(
      <DataPrivacyRow
        title="Аналитика использования"
        action={{
          kind: 'switch',
          checked: true,
          onChange: vi.fn(),
          label: 'Аналитика использования',
        }}
      />,
    );
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('action="switch" вызывает onChange при переключении', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DataPrivacyRow
        title="Аналитика использования"
        action={{ kind: 'switch', checked: false, onChange, label: 'Аналитика использования' }}
      />,
    );
    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('action="button" рендерит кнопку действия и вызывает onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DataPrivacyRow
        title="Удалить аккаунт"
        action={{ kind: 'button', label: 'Удалить', onClick }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('action="navigate" рендерит всю строку кликабельной кнопкой с шевроном', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <DataPrivacyRow
        title="Политика конфиденциальности"
        action={{ kind: 'navigate', label: 'Политика конфиденциальности', onClick }}
      />,
    );
    const row = screen.getByRole('button', { name: 'Политика конфиденциальности' });
    await user.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('action="none" не рендерит ни одного интерактивного элемента', () => {
    render(
      <DataPrivacyRow title="Версия приложения" description="1.0.0" action={{ kind: 'none' }} />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('action="button" с variant="destructive" рисует разрушающую кнопку, а не акцентную', () => {
    render(
      <DataPrivacyRow
        title="Удалить локальные данные"
        action={{ kind: 'button', label: 'Удалить', onClick: vi.fn(), variant: 'destructive' }}
      />,
    );
    // Зелёная акцентная кнопка на стирании данных читается как «безопасно» —
    // это ровно наоборот, поэтому вид проверяется, а не оставляется на глаз.
    expect(screen.getByRole('button', { name: 'Удалить' })).toHaveClass(
      'shagi-button--destructive',
    );
  });

  it('action="status" показывает статус справа и ничего не делает интерактивного', () => {
    render(
      <DataPrivacyRow
        title="Хранение"
        description="Данные лежат только на этом устройстве"
        action={{ kind: 'status', label: 'Только здесь' }}
      />,
    );
    expect(screen.getByText('Только здесь')).toBeInTheDocument();
    // Статус — сообщение, а не действие: если он вдруг станет кликабельным,
    // человек будет по нему тыкать и ничего не получать.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('action="switch" с disabled отключает переключатель', () => {
    render(
      <DataPrivacyRow
        title="Аналитика"
        action={{ kind: 'switch', checked: false, onChange: vi.fn(), disabled: true }}
      />,
    );
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
