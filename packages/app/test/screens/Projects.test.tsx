import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { makeOutboxEntry, makeProject } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { Project } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Projects } from '../../src/screens/Projects.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

async function seedProjects(storage: StoragePort, projects: readonly Project[]): Promise<void> {
  for (const project of projects) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'project', value: project }],
        outbox: [makeOutboxEntry('project', project.id)],
      });
    });
  }
}

/**
 * Тот же приём захвата `storage`, что `Inbox.test.tsx`
 * (`SeedThenInboxCapturing`): сеет проекты и монтирует `Projects` только
 * ПОСЛЕ завершения посева, на том же инстансе `StoragePort`, который
 * получает сам экран (`useStorage()`, один на дерево `AppProvider`), и
 * параллельно отдаёт этот инстанс наружу — тесты действий проверяют
 * реальный эффект команды в хранилище, а не только перерисовку экрана.
 */
function SeedThenProjectsCapturing({
  projects,
  onStorage,
}: {
  projects: readonly Project[];
  onStorage: (storage: StoragePort) => void;
}): ReactElement | null {
  const storage = useStorage();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    onStorage(storage);
  }, [storage, onStorage]);

  useEffect(() => {
    let cancelled = false;
    void seedProjects(storage, projects).then(() => {
      if (!cancelled) setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `projects` фиксирован на монтирование теста, не меняется между рендерами
  }, [storage]);

  return seeded ? <Projects /> : null;
}

function renderProjectsCapturingStorage(projects: readonly Project[] = []): {
  getStorage: () => StoragePort;
} {
  const controller = createAppController({ screen: 'projects' });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenProjectsCapturing
        projects={projects}
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
  };
}

describe('Projects (M16) — список', () => {
  it('показывает только активные проекты, не архивные', async () => {
    const active = makeProject({ title: 'Активный проект' });
    const archived = makeProject({
      title: 'Архивный проект',
      archivedAt: Temporal.Now.instant(),
    });
    renderProjectsCapturingStorage([active, archived]);

    await waitFor(() => expect(screen.getByText('Активный проект')).toBeInTheDocument());
    expect(screen.queryByText('Архивный проект')).not.toBeInTheDocument();
  });

  it('M19 Empty: пустой список проектов показывает EmptyState с CTA «Создать проект»', async () => {
    renderProjectsCapturingStorage([]);
    await waitFor(() => expect(screen.getByText(t('projects', 'empty.title'))).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: t('projects', 'actions.create') }),
    ).toBeInTheDocument();
  });
});

describe('Projects — создание проекта', () => {
  it('создание с валидными полями появляется в списке (без ручной мутации локального состояния)', async () => {
    const user = userEvent.setup();
    const { getStorage } = renderProjectsCapturingStorage([]);

    await waitFor(() => expect(screen.getByText(t('projects', 'empty.title'))).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('projects', 'actions.create') }));

    const titleInput = await screen.findByLabelText(t('projects', 'form.titleLabel'));
    await user.type(titleInput, 'Ремонт кухни');
    await user.click(screen.getByRole('button', { name: t('projects', 'form.submit') }));

    await waitFor(() => expect(screen.getByText('Ремонт кухни')).toBeInTheDocument());

    const stored = await getStorage().projects.listActive();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.title).toBe('Ремонт кухни');
  });

  it('создание с пустым title → Toast, проект не создан', async () => {
    const user = userEvent.setup();
    const { getStorage } = renderProjectsCapturingStorage([]);

    await waitFor(() => expect(screen.getByText(t('projects', 'empty.title'))).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('projects', 'actions.create') }));
    await screen.findByLabelText(t('projects', 'form.titleLabel'));
    await user.click(screen.getByRole('button', { name: t('projects', 'form.submit') }));

    await waitFor(() =>
      expect(screen.getByText(t('projects', 'errors.createFailed'))).toBeInTheDocument(),
    );
    expect(await getStorage().projects.listActive()).toHaveLength(0);
  });

  it('11-й проект при 10 уже активных → карточка лимита Pro, не обычная ошибка', async () => {
    const user = userEvent.setup();
    const existing = Array.from({ length: 10 }, (_, index) =>
      makeProject({ title: `Проект ${index + 1}` }),
    );
    const { getStorage } = renderProjectsCapturingStorage(existing);

    await waitFor(() => expect(screen.getByText('Проект 1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('projects', 'actions.create') }));
    const titleInput = await screen.findByLabelText(t('projects', 'form.titleLabel'));
    await user.type(titleInput, 'Одиннадцатый');
    await user.click(screen.getByRole('button', { name: t('projects', 'form.submit') }));

    await waitFor(() => expect(screen.getByText(t('projects', 'limit.title'))).toBeInTheDocument());
    expect(screen.queryByText(t('projects', 'errors.createFailed'))).not.toBeInTheDocument();
    expect(await getStorage().projects.listActive()).toHaveLength(10);
  });
});
