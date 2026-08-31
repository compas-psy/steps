import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Offline } from '../../../src/components/feedback/index.js';

describe('Offline', () => {
  it('без видимого текста, доступное имя обязателен через label', () => {
    render(<Offline label="Нет соединения" />);
    const indicator = screen.getByRole('status', { name: 'Нет соединения' });
    expect(indicator).toHaveTextContent('');
  });

  it('иконка декоративна (aria-hidden), смысл несёт только label на контейнере', () => {
    const { container } = render(<Offline label="Нет соединения" />);
    const icon = container.querySelector('.shagi-offline__icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('icon-слот можно переопределить', () => {
    render(<Offline label="Нет соединения" icon={<span data-testid="custom-icon" />} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });
});
