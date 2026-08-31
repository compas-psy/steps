import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ServiceMark } from '../../src/index.js';

describe('ServiceMark', () => {
  it('рендерит SVG-знак заданного размера', () => {
    // Сравнение через шаблонную строку, а не литерал `'48px'` — гейт
    // адгезии (`.oxlintrc.json`) ловит именно `px`-литералы в исходниках
    // компонентов; `size` здесь рантайм-пропс (см. комментарий в
    // `ServiceMark.css`), а не токен, так что тесту разумно сравнивать
    // с вычисленной строкой, а не жёстко прошитым числом дважды.
    const size = 48;
    const { container } = render(<ServiceMark size={size} />);
    const mark = container.firstElementChild as HTMLElement;
    expect(mark.style.width).toBe(`${size}px`);
    expect(mark.style.height).toBe(`${size}px`);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('bare — без фоновой плашки (нет width/height на обёртке)', () => {
    const { container } = render(<ServiceMark bare />);
    const mark = container.firstElementChild as HTMLElement;
    expect(mark.style.width).toBe('');
    expect(mark.style.height).toBe('');
  });

  it('декоративен — сам знак не объявляет своё имя (не единственный носитель смысла на экране)', () => {
    const { container } = render(<ServiceMark />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('circle — скругление 50%', () => {
    const { container } = render(<ServiceMark shape="circle" />);
    const mark = container.firstElementChild as HTMLElement;
    expect(mark.style.borderRadius).toBe('50%');
  });
});
