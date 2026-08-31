import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from '../../src/index.js';

describe('Badge', () => {
  it('рендерит переданный текст', () => {
    render(<Badge>Новое</Badge>);
    expect(screen.getByText('Новое')).toBeInTheDocument();
  });

  it('поддерживает все варианты без падения рендера', () => {
    const variants = [
      'default',
      'secondary',
      'outline',
      'success',
      'pending',
      'info',
      'new',
      'destructive',
    ] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  it('dot — декоративная точка, не мешает тексту', () => {
    render(<Badge dot>Активно</Badge>);
    expect(screen.getByText('Активно')).toBeInTheDocument();
  });

  it('icon — декоративная иконка рядом с текстом (не только цвет несёт смысл)', () => {
    const { container } = render(
      <Badge variant="destructive" icon="warning">
        Просрочено
      </Badge>,
    );
    expect(screen.getByText('Просрочено')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
