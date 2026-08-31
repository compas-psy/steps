import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FocusMarker } from '../../../src/components/task/index.js';

describe('FocusMarker', () => {
  it('декоративен — aria-hidden, не попадает в дерево доступности', () => {
    const { container } = render(<FocusMarker />);
    const marker = container.querySelector('.shagi-focus-marker');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveAttribute('aria-hidden', 'true');
  });

  it('принимает className', () => {
    const { container } = render(<FocusMarker className="custom" />);
    expect(container.querySelector('.shagi-focus-marker.custom')).toBeInTheDocument();
  });
});
