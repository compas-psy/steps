import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Priority } from '../../../src/components/organization/index.js';

describe('Priority', () => {
  it('рендерит переданный текст (компонент не хардкодит подписи P1–P4)', () => {
    render(<Priority level="p1">P1 · Критично</Priority>);
    expect(screen.getByText('P1 · Критично')).toBeInTheDocument();
  });

  it('поддерживает все уровни p1–p4 без падения рендера, каждый со своим классом', () => {
    const levels = ['p1', 'p2', 'p3', 'p4'] as const;
    for (const level of levels) {
      const { unmount, getByText } = render(<Priority level={level}>{level}</Priority>);
      expect(getByText(level).className).toMatch(new RegExp(`--${level}\\b`));
      unmount();
    }
  });

  it('чисто презентационный — не переупорядочивает и не пересчитывает ничего сам (нет побочных пропсов)', () => {
    // Проверка контракта: компонент — просто span с классом от `level`, без
    // скрытой сортировки/эффектов. Рендер дважды с разным level не должен
    // держать никакого внутреннего состояния между рендерами.
    const { rerender, getByText } = render(<Priority level="p4">низкий</Priority>);
    expect(getByText('низкий').className).toMatch(/--p4\b/);
    rerender(<Priority level="p1">низкий</Priority>);
    expect(getByText('низкий').className).toMatch(/--p1\b/);
  });
});
