import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { AppShell, isMainTabScreen } from '../../src/shell/AppShell.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

describe('isMainTabScreen', () => {
  it('todayEmpty и projects — главные экраны с постоянной навигацией', () => {
    expect(isMainTabScreen('todayEmpty')).toBe(true);
    expect(isMainTabScreen('projects')).toBe(true);
  });

  it('остальные экраны (онбординг, Inbox) — не главные вкладки', () => {
    expect(isMainTabScreen('launch')).toBe(false);
    expect(isMainTabScreen('welcome')).toBe(false);
    expect(isMainTabScreen('signIn')).toBe(false);
    expect(isMainTabScreen('firstTask')).toBe(false);
    expect(isMainTabScreen('nlpOnboarding')).toBe(false);
    expect(isMainTabScreen('inbox')).toBe(false);
  });
});

describe('AppShell', () => {
  it('рендерит children и нижнюю навигацию с активным пунктом «Сегодня»', () => {
    const controller = createAppController({ screen: 'todayEmpty' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <AppShell>
          <div data-testid="content">контент</div>
        </AppShell>
      </AppProvider>,
    );

    expect(screen.getByTestId('content')).toBeInTheDocument();
    const todayItem = screen.getByRole('button', { name: t('shell', 'bottomNav.today') });
    expect(todayItem).toHaveAttribute('aria-current', 'page');
    const projectsItem = screen.getByRole('button', { name: t('shell', 'bottomNav.projects') });
    expect(projectsItem).not.toHaveAttribute('aria-current');
  });

  it('клик по «Проекты» переводит контроллер на экран projects', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'todayEmpty' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <AppShell>
          <div>контент</div>
        </AppShell>
      </AppProvider>,
    );

    await user.click(screen.getByRole('button', { name: t('shell', 'bottomNav.projects') }));

    expect(controller.getState().screen).toBe('projects');
  });

  it('центральная кнопка «Быстрое добавление» честно disabled — UI ещё не построен (эпик E05)', () => {
    const controller = createAppController({ screen: 'todayEmpty' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <AppShell>
          <div>контент</div>
        </AppShell>
      </AppProvider>,
    );

    const centerButton = screen.getByRole('button', {
      name: t('shell', 'bottomNav.quickAddUnavailable'),
    });
    expect(centerButton).toBeDisabled();
  });
});
