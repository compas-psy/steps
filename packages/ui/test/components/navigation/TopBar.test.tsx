import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TopBar } from '../../../src/components/navigation/index.js';

describe('TopBar', () => {
  it('рендерит слоты leading/children/actions, не подставляя ничего своего', () => {
    render(
      <TopBar
        leading={<button type="button">Назад</button>}
        actions={<button type="button">Ещё</button>}
      >
        <h1>Сегодня</h1>
      </TopBar>,
    );

    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ещё' })).toBeInTheDocument();
  });

  it('без leading/actions не рендерит пустые слоты-обёртки', () => {
    render(
      <TopBar>
        <h1>Заголовок</h1>
      </TopBar>,
    );
    expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeInTheDocument();
  });

  it('является header-лендмарком', () => {
    render(<TopBar>Контент</TopBar>);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
