import type { ReactElement } from 'react';
import { useEffect } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import type { StoragePort } from '@shagi/storage';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { FirstTask } from '../../src/screens/FirstTask.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

/** Тот же приём, что `state/context.test.tsx` `Probe` — читает `useStorage()`
 * изнутри дерева `AppProvider`, чтобы тест мог проверить эффект команды на
 * ТОМ ЖЕ самом инстансе хранилища, который реально использует `FirstTask`
 * (у `AppProvider` он один на дерево, `useMemo` по `host.storageBackend`). */
function Harness({ onStorage }: { onStorage: (storage: StoragePort) => void }): ReactElement {
  const storage = useStorage();
  useEffect(() => {
    onStorage(storage);
  }, [storage, onStorage]);
  return <FirstTask />;
}

describe('FirstTask (M04)', () => {
  it('создаёт реальную задачу processed + сегодня через createTaskCommand', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'firstTask' });
    let capturedStorage: StoragePort | undefined;

    render(
      <AppProvider host={testHost()} controller={controller}>
        <Harness onStorage={(storage) => (capturedStorage = storage)} />
      </AppProvider>,
    );

    await user.type(
      screen.getByLabelText(t('onboarding', 'firstTask.inputLabel')),
      'Позвонить маме',
    );
    await user.click(
      screen.getByRole('button', { name: t('onboarding', 'firstTask.submitLabel') }),
    );

    await waitFor(() => expect(controller.getState().screen).toBe('nlpOnboarding'));

    const storage = capturedStorage;
    if (storage === undefined) throw new Error('storage не захвачен — Harness не смонтировался');

    const tasks = await storage.tasks.listByCaptureStateAndStatus('processed', 'active');
    expect(tasks).toHaveLength(1);
    const [task] = tasks;
    expect(task?.title).toBe('Позвонить маме');
    expect(task?.captureState).toBe('processed');
    expect(task?.plannedDate).toEqual(Temporal.Now.plainDateISO());
    expect(task?.source).toBe('user');
  });

  it('отклонённая валидатором задача показывает ошибку и не переходит дальше молча', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'firstTask' });

    render(
      <AppProvider host={testHost()} controller={controller}>
        <FirstTask />
      </AppProvider>,
    );

    // Только пунктуация — правило 14 (`hasReadableContent`) блокирует
    // сохранение как нечитаемый заголовок.
    await user.type(screen.getByLabelText(t('onboarding', 'firstTask.inputLabel')), '...');
    await user.click(
      screen.getByRole('button', { name: t('onboarding', 'firstTask.submitLabel') }),
    );

    await waitFor(() =>
      expect(screen.getByText(t('onboarding', 'firstTask.error'))).toBeInTheDocument(),
    );
    expect(controller.getState().screen).toBe('firstTask');
  });
});
