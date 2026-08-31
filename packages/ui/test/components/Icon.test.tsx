import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ICON_NAMES, Icon } from '../../src/index.js';

describe('Icon', () => {
  it('без label декоративна (aria-hidden)', () => {
    const { container } = render(<Icon name="check" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('с label — role="img" с этим именем', () => {
    render(<Icon name="star" label="В фокусе" />);
    expect(screen.getByRole('img', { name: 'В фокусе' })).toBeInTheDocument();
  });

  it('рендерит геометрию для каждой из 38 иконок реестра без падения', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg?.children.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('size управляет шириной/высотой SVG', () => {
    const { container } = render(<Icon name="close" size={32} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
  });
});
