import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { makeOutboxEntry, makeProject, makeTask } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { Project, Task } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Completed } from '../../src/screens/Completed.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

interface Seed {
  readonly projects?: readonly Project[];
  readonly tasks?: readonly Task[];
}

/** Тот же приём посева, что `Search.test.tsx`/`Plan.test.tsx` (см. их
 * заголовки): по одной сущности за транзакцию, проекты ДО задач. */
async function seed(storage: StoragePort, entities: Seed): Promise<void> {
  for (const project of entities.projects ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'project', value: project }],
        outbox: [makeOutboxEntry('project', project.id)],
      });
    });
  }
  for (const task of entities.tasks ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });
  }
}

function SeedThenCompletedCapturing({
  entities,
  onStorage,
}: {
  entities: Seed;
  onStorage: (storage: StoragePort) => void;
}): ReactElement | null {
  const storage = useStorage();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    onStorage(storage);
  }, [storage, onStorage]);

  useEffect(() => {
    let cancelled = false;
    void seed(storage, entities).then(() => {
      if (!cancelled) setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- фиксировано на монтирование теста
  }, [storage]);

  return seeded ? <Completed /> : null;
}

function renderCompleted(entities: Seed = {}): {
  getStorage: () => StoragePort;
  controller: ReturnType<typeof createAppController>;
} {
  const controller = createAppController({ screen: 'completed' });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenCompletedCapturing
        entities={entities}
        onStorage={(storage) => (capturedStorage = storage)}
      />
    </AppProvider>,
  );
  return {
    getStorage: () => {
      if (capturedStorage === undefined)
        throw new Error('storage не захвачен — компонент не смонтировался');
      return capturedStorage;
    },
    controller,
  };
}

async function waitForPageTitle(): Promise<void> {
  await waitFor(() => expect(screen.getByText(t('completed', 'pageTitle'))).toBeInTheDocument());
}

describe('Completed — M36, список', () => {
  it('показывает завершённые задачи, не показывает активные', async () => {
    const completed = makeTask({ title: 'Завершённая задача', status: 'completed' });
    const active = makeTask({ title: 'Активная задача', status: 'active' });
    renderCompleted({ tasks: [completed, active] });

    await waitFor(() => expect(screen.getByText('Завершённая задача')).toBeInTheDocument());
    expect(screen.queryByText('Активная задача')).not.toBeInTheDocument();
  });

  it('пустой список завершённых — calm empty state', async () => {
    renderCompleted();

    await waitFor(() =>
      expect(screen.getByText(t('completed', 'empty.title'))).toBeInTheDocument(),
    );
  });

  it('кнопка «Назад» возвращает на Search', async () => {
    const user = userEvent.setup();
    const { controller } = renderCompleted();
    await waitForPageTitle();

    await user.click(screen.getByRole('button', { name: t('completed', 'back.label') }));

    expect(controller.getState().screen).toBe('search');
  });
});

describe('Completed — восстановление обычной задачи (простой случай, без выбора)', () => {
  it('клик открывает диалог с названием задачи и кнопкой «Восстановить»; подтверждение переводит задачу в active и убирает её из списка', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Помыть окна', status: 'completed' });
    const { getStorage } = renderCompleted({ tasks: [task] });

    await waitFor(() => expect(screen.getByText('Помыть окна')).toBeInTheDocument());
    await user.click(screen.getByText('Помыть окна'));

    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Помыть окна' }));
    const restoreButton = await waitFor(() =>
      within(dialog).getByRole('button', { name: t('completed', 'dialog.restore') }),
    );
    expect(restoreButton).toBeEnabled();

    await user.click(restoreButton);

    await waitFor(() => expect(screen.queryByText('Помыть окна')).not.toBeInTheDocument());
    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.status).toBe('active');
    expect(stored?.completedAt).toBeNull();
  });
});

describe('Completed — §11.11 Parent+Subtask оба завершены', () => {
  it('диалог показывает выбор «Восстановить пару»/«Создать отдельную задачу»; «Восстановить» заблокирована до выбора', async () => {
    const user = userEvent.setup();
    const parent = makeTask({ title: 'Родительская задача', status: 'completed' });
    const child = makeTask({
      title: 'Дочерняя задача',
      status: 'completed',
      parentTaskId: parent.id,
    });
    renderCompleted({ tasks: [parent, child] });

    await waitFor(() => expect(screen.getByText('Дочерняя задача')).toBeInTheDocument());
    await user.click(screen.getByText('Дочерняя задача'));

    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Дочерняя задача' }));
    const restorePairOption = await waitFor(() =>
      within(dialog).getByRole('button', {
        name: t('completed', 'dialog.hierarchyChoice.restorePair'),
      }),
    );
    expect(
      within(dialog).getByRole('button', {
        name: t('completed', 'dialog.hierarchyChoice.separateTask'),
      }),
    ).toBeInTheDocument();

    const restoreButton = within(dialog).getByRole('button', {
      name: t('completed', 'dialog.restore'),
    });
    expect(restoreButton).toBeDisabled();

    // Архивный/удалённый-проект выбор здесь НЕ показан — задачи без проекта.
    expect(
      within(dialog).queryByText(t('completed', 'dialog.archivedProjectChoice.prompt')),
    ).not.toBeInTheDocument();

    await user.click(restorePairOption);
    expect(restoreButton).toBeEnabled();
  });
});

describe('Completed — §11.11 архивный проект', () => {
  it('диалог показывает выбор «Восстановить проект и задачу»/«Восстановить во Входящие»', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Архивный проект', archivedAt: makeTask().createdAt });
    const task = makeTask({
      title: 'Задача в архивном проекте',
      status: 'completed',
      projectId: project.id,
    });
    renderCompleted({ projects: [project], tasks: [task] });

    await waitFor(() => expect(screen.getByText('Задача в архивном проекте')).toBeInTheDocument());
    await user.click(screen.getByText('Задача в архивном проекте'));

    const dialog = await waitFor(() =>
      screen.getByRole('dialog', { name: 'Задача в архивном проекте' }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', {
          name: t('completed', 'dialog.archivedProjectChoice.restoreProject'),
        }),
      ).toBeInTheDocument(),
    );
    expect(
      within(dialog).getByRole('button', {
        name: t('completed', 'dialog.archivedProjectChoice.restoreToInbox'),
      }),
    ).toBeInTheDocument();
    // Иерархический выбор здесь НЕ показан — задача не subtask.
    expect(
      within(dialog).queryByText(t('completed', 'dialog.hierarchyChoice.prompt')),
    ).not.toBeInTheDocument();
  });
});

describe('Completed — §11.10 recurring с уже существующим next occurrence', () => {
  it('диалог показывает ТОЛЬКО «Создать отдельную копию», без обычной кнопки «Восстановить»', async () => {
    const user = userEvent.setup();
    const occurrence = makeTask({ title: 'Полить цветы', status: 'completed' });
    const seriesId = occurrence.id; // произвольный, но валидный Uuid для seriesId.
    const completedOccurrence = { ...occurrence, seriesId, occurrenceSeq: 1n } as Task;
    const nextOccurrence = makeTask({
      title: 'Полить цветы (следующее)',
      status: 'active',
      seriesId,
    });
    const nextWithSeq = { ...nextOccurrence, occurrenceSeq: 2n } as Task;

    renderCompleted({ tasks: [completedOccurrence, nextWithSeq] });

    await waitFor(() => expect(screen.getByText('Полить цветы')).toBeInTheDocument());
    await user.click(screen.getByText('Полить цветы'));

    const dialog = await waitFor(() => screen.getByRole('dialog', { name: 'Полить цветы' }));
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', {
          name: t('completed', 'dialog.recurringBlocked.createCopy'),
        }),
      ).toBeInTheDocument(),
    );
    expect(
      within(dialog).queryByRole('button', { name: t('completed', 'dialog.restore') }),
    ).not.toBeInTheDocument();
  });
});
