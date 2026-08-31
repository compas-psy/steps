import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Divider } from '../../src/index.js';

describe('Divider', () => {
  it('рендерится с ролью separator (нативная роль <hr>)', () => {
    render(<Divider />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('вертикальная ориентация выставляет aria-orientation', () => {
    render(<Divider orientation="vertical" />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('горизонтальная ориентация не выставляет aria-orientation (умолчание separator — horizontal)', () => {
    render(<Divider orientation="horizontal" />);
    expect(screen.getByRole('separator')).not.toHaveAttribute('aria-orientation');
  });
});
