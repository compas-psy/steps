import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Entitlement } from '../../../src/components/account/index.js';

describe('Entitlement', () => {
  it('рендерит заголовок, описание и CTA-кнопку', () => {
    render(
      <Entitlement
        title="Бесплатный тариф"
        description="Доступно 20 активных задач из 20"
        ctaLabel="Улучшить тариф"
        onCta={vi.fn()}
      />,
    );
    expect(screen.getByText('Бесплатный тариф')).toBeInTheDocument();
    expect(screen.getByText('Доступно 20 активных задач из 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Улучшить тариф' })).toBeInTheDocument();
  });

  it('клик по CTA вызывает onCta', async () => {
    const user = userEvent.setup();
    const onCta = vi.fn();
    render(<Entitlement title="Лимит достигнут" ctaLabel="Улучшить тариф" onCta={onCta} />);
    await user.click(screen.getByRole('button', { name: 'Улучшить тариф' }));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('без onDismiss/dismissLabel кнопка закрытия не рендерится', () => {
    render(<Entitlement title="Тариф Про" ctaLabel="Подробнее" onCta={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /закрыть/i })).not.toBeInTheDocument();
  });

  it('с onDismiss и dismissLabel рендерит кнопку закрытия и вызывает onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Entitlement
        title="Тариф Про"
        ctaLabel="Подробнее"
        onCta={vi.fn()}
        onDismiss={onDismiss}
        dismissLabel="Закрыть"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('tone="accent" отражается модификатором класса', () => {
    const { container } = render(
      <Entitlement title="Тариф Про" ctaLabel="Подробнее" onCta={vi.fn()} tone="accent" />,
    );
    expect(container.querySelector('.shagi-entitlement--accent')).not.toBeNull();
  });

  it('без description строка описания не рендерится', () => {
    render(<Entitlement title="Тариф Про" ctaLabel="Подробнее" onCta={vi.fn()} />);
    expect(screen.queryByText(/активных задач/)).not.toBeInTheDocument();
  });
});
