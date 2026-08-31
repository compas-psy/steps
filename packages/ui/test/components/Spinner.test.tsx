import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from '../../src/index.js';

describe('Spinner', () => {
  it('без label декоративен (aria-hidden, не объявляется отдельно)', () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('с label — role="status" с этим именем', () => {
    render(<Spinner label="Загрузка" />);
    expect(screen.getByRole('status', { name: 'Загрузка' })).toBeInTheDocument();
  });
});
