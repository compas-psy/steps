import type { ReactElement } from 'react';

import { render, screen as domScreen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { describe, expect, it, vi } from 'vitest';

import type { AppHost } from '../../src/App.js';
import {
  AppProvider,
  useAppController,
  useAppState,
  useHost,
  useStorage,
} from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

function Probe(): ReactElement {
  const state = useAppState();
  const controller = useAppController();
  const host = useHost();
  const storage = useStorage();
  return (
    <div>
      <span data-testid="screen">{state.screen}</span>
      <span data-testid="has-storage">{String(storage !== undefined)}</span>
      <span data-testid="backend-kind">{host.storageBackend.kind}</span>
      <button type="button" onClick={() => controller.goTo('welcome')}>
        перейти
      </button>
    </div>
  );
}

describe('AppProvider / useAppState / useAppController / useHost', () => {
  it('отдаёт текущее состояние и host потомкам', () => {
    render(
      <AppProvider host={testHost()}>
        <Probe />
      </AppProvider>,
    );

    expect(domScreen.getByTestId('screen')).toHaveTextContent('launch');
    expect(domScreen.getByTestId('has-storage')).toHaveTextContent('true');
  });

  it('перерендеривает подписчиков после goTo через контроллер', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider host={testHost()}>
        <Probe />
      </AppProvider>,
    );

    await user.click(domScreen.getByRole('button', { name: 'перейти' }));

    expect(domScreen.getByTestId('screen')).toHaveTextContent('welcome');
  });

  it('принимает предустановленный контроллер (для тестов экранов, начинающих не с launch)', () => {
    const controller = createAppController({ screen: 'signIn' });
    render(
      <AppProvider host={testHost()} controller={controller}>
        <Probe />
      </AppProvider>,
    );

    expect(domScreen.getByTestId('screen')).toHaveTextContent('signIn');
  });

  it('useAppState вне AppProvider бросает понятную ошибку, а не падает на undefined', () => {
    // подавляем ожидаемый React-лог об ошибке в рендере, чтобы не шуметь в выводе теста
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/AppProvider/);
    consoleError.mockRestore();
  });
});
