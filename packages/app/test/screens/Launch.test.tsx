import { render, waitFor } from '@testing-library/react';
import { createUnavailablePlatform, type PlatformCapabilitiesRegistry } from '@shagi/platform';
import { makeOutboxEntry, makeTask } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import { useEffect, useState, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Launch } from '../../src/screens/Launch.js';
import { ONBOARDING_DONE_KEY } from '../../src/state/onboarding.js';

/** Платформа с РАБОЧИМ хранилищем настроек — `createUnavailablePlatform`
 * отдаёт `Unavailable`, а половина смысла этого экрана как раз в том, что
 * он читает сохранённый флаг. */
function platformWithPreferences(initial: Record<string, string> = {}): {
  platform: PlatformCapabilitiesRegistry;
  store: Map<string, string>;
} {
  const store = new Map(Object.entries(initial));
  const platform: PlatformCapabilitiesRegistry = {
    ...createUnavailablePlatform(),
    localPreferences: {
      get: (key) => store.get(key) ?? null,
      set: (key, value) => void store.set(key, value),
      remove: (key) => void store.delete(key),
    },
  };
  return { platform, store };
}

function hostWith(platform: PlatformCapabilitiesRegistry): AppHost {
  return { platform, storageBackend: { kind: 'memory' } };
}

/** Кладёт задачи в то же хранилище, которое построит `AppProvider`, и только
 * потом монтирует `Launch` — иначе экран решал бы раньше, чем данные есть. */
function SeedThenLaunch({
  tasks,
}: {
  tasks: readonly ReturnType<typeof makeTask>[];
}): ReactElement | null {
  const storage: StoragePort = useStorage();
  const [ready, setReady] = useState(tasks.length === 0);

  useEffect(() => {
    if (tasks.length === 0) return;
    void (async () => {
      for (const task of tasks) {
        await storage.runTransaction(async (tx) => {
          await tx.applyMutation({
            writes: [{ entity: 'task', value: task }],
            outbox: [makeOutboxEntry('task', task.id)],
          });
        });
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- посев ровно один раз
  }, []);

  return ready ? <Launch /> : null;
}

describe('Launch (M01)', () => {
  it('не рендерит видимый контент — никакого фейкового лоадера', () => {
    const { platform } = platformWithPreferences();
    const { container } = render(
      <AppProvider host={hostWith(platform)}>
        <Launch />
      </AppProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('первый запуск: ни флага, ни задач — ведёт на приветствие', async () => {
    const { platform } = platformWithPreferences();
    const controller = createAppController();
    render(
      <AppProvider host={hostWith(platform)} controller={controller}>
        <Launch />
      </AppProvider>,
    );

    await waitFor(() => expect(controller.getState().screen).toBe('welcome'));
  });

  it('онбординг уже пройден (флаг) — ведёт сразу в продукт, а не в приветствие', async () => {
    const { platform } = platformWithPreferences({ [ONBOARDING_DONE_KEY]: '1' });
    const controller = createAppController();
    render(
      <AppProvider host={hostWith(platform)} controller={controller}>
        <Launch />
      </AppProvider>,
    );

    await waitFor(() => expect(controller.getState().screen).toBe('todayEmpty'));
  });

  it('флага нет, но в хранилище есть задачи — тоже в продукт (запасной сигнал)', async () => {
    // Ровно случай, из-за которого экран и переписан: человек с задачами
    // получал онбординг поверх собственных данных.
    const { platform } = platformWithPreferences();
    const controller = createAppController();
    render(
      <AppProvider host={hostWith(platform)} controller={controller}>
        <SeedThenLaunch tasks={[makeTask({ title: 'Проверка сборки' })]} />
      </AppProvider>,
    );

    await waitFor(() => expect(controller.getState().screen).toBe('todayEmpty'));
  });

  it('все задачи завершены — продукт всё равно уже виден, приветствия быть не должно', async () => {
    const { platform } = platformWithPreferences();
    const controller = createAppController();
    render(
      <AppProvider host={hostWith(platform)} controller={controller}>
        <SeedThenLaunch tasks={[makeTask({ title: 'Готовая', status: 'completed' })]} />
      </AppProvider>,
    );

    await waitFor(() => expect(controller.getState().screen).toBe('todayEmpty'));
  });

  it('порт настроек недоступен и задач нет — приветствие, без падения', async () => {
    const controller = createAppController();
    render(
      <AppProvider
        host={{ platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } }}
        controller={controller}
      >
        <Launch />
      </AppProvider>,
    );

    await waitFor(() => expect(controller.getState().screen).toBe('welcome'));
  });
});
