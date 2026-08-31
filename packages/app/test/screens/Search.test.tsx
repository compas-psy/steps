import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import {
  makeLabel,
  makeOutboxEntry,
  makeProject,
  makeTask,
  makeTaskLabel,
} from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { Label, Project, Task } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Search } from '../../src/screens/Search.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

interface Seed {
  readonly projects?: readonly Project[];
  readonly tasks?: readonly Task[];
  readonly labels?: readonly Label[];
  readonly taskLabels?: readonly ReturnType<typeof makeTaskLabel>[];
}

/** Тот же приём посева, что `TaskDetail.test.tsx`/`ProjectDetail.test.tsx`
 * (см. их заголовки) — по одной сущности за транзакцию, проекты/метки ДО
 * задач, `task_label` — последними (ссылаются на уже существующие задачу и
 * метку). */
async function seed(storage: StoragePort, entities: Seed): Promise<void> {
  for (const project of entities.projects ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'project', value: project }],
        outbox: [makeOutboxEntry('project', project.id)],
      });
    });
  }
  for (const label of entities.labels ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'label', value: label }],
        outbox: [makeOutboxEntry('label', label.id)],
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
  for (const link of entities.taskLabels ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task_label', value: link }],
        outbox: [makeOutboxEntry('task_label', link.taskId)],
      });
    });
  }
}

/** Тот же приём захвата `storage`, что `ProjectDetail.test.tsx`/
 * `TaskDetail.test.tsx` — сеет данные и монтирует `Search` только ПОСЛЕ
 * завершения посева, на том же инстансе `StoragePort`, который получает сам
 * экран. */
function SeedThenSearchCapturing({
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

  return seeded ? <Search /> : null;
}

function renderSearch(entities: Seed = {}): {
  getStorage: () => StoragePort;
  controller: ReturnType<typeof createAppController>;
} {
  const controller = createAppController({ screen: 'search' });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenSearchCapturing
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

/** Ждёт, пока посев (`SeedThenSearchCapturing`) завершится и `Search`
 * реально смонтируется — без этого `getByRole` иногда попадает на кадр до
 * разрешения посевного промиса (тот же класс гонки, что у остальных
 * `Seed...Capturing`-обёрток в этом пакете тестов, только они всегда ждут
 * текст экрана ПЕРЕД первым взаимодействием — здесь то же самое, только
 * инкапсулировано в один хелпер, раз поле ввода нужно почти в каждом тесте). */
async function searchInput(): Promise<HTMLElement> {
  return waitFor(() => screen.getByRole('textbox', { name: t('search', 'input.label') }));
}

describe('Search — M34 Empty', () => {
  it('пустое поле ввода показывает calm empty state, без секций результатов', async () => {
    renderSearch();

    await waitFor(() => expect(screen.getByText(t('search', 'empty.title'))).toBeInTheDocument());
    expect(screen.queryByText(t('search', 'sections.tasks'))).not.toBeInTheDocument();
    expect(screen.queryByText(t('search', 'noResults.title'))).not.toBeInTheDocument();
  });
});

describe('Search — M35 Results, ранжирование (01§15)', () => {
  it('exact title выше prefix выше title token выше substring — один и тот же запрос', async () => {
    const user = userEvent.setup();
    const exact = makeTask({ title: 'Хлеб' });
    const prefix = makeTask({ title: 'Хлебозавод' });
    const titleToken = makeTask({ title: 'Мягкий хлеб' });
    const substring = makeTask({ title: 'белохлебный' });
    // Порядок посева — намеренно не по ожидаемому порядку выдачи, чтобы тест
    // не проходил случайно от порядка вставки.
    renderSearch({ tasks: [substring, titleToken, exact, prefix] });

    await user.type(await searchInput(), 'хлеб');

    await waitFor(() => expect(screen.getByText('Хлеб')).toBeInTheDocument());
    const tasksSection = screen.getByRole('region', { name: t('search', 'sections.tasks') });
    const titles = within(tasksSection)
      .getAllByText(/Хлеб|хлеб/)
      .map((el) => el.textContent);
    expect(titles).toEqual(['Хлеб', 'Хлебозавод', 'Мягкий хлеб', 'белохлебный']);
  });

  it('находит и активные, и завершённые задачи; при равенстве уровня активная — раньше завершённой (01§15 п.7)', async () => {
    const user = userEvent.setup();
    const active = makeTask({ title: 'Одинаковая', status: 'active' });
    const completed = makeTask({ title: 'Одинаковая', status: 'completed' });
    renderSearch({ tasks: [completed, active] });

    await user.type(await searchInput(), 'одинаковая');

    await waitFor(() => expect(screen.getAllByText('Одинаковая')).toHaveLength(2));
    const tasksSection = screen.getByRole('region', { name: t('search', 'sections.tasks') });
    const rows = within(tasksSection).getAllByText('Одинаковая');
    // Активная задача — первая строка секции задач.
    const activeRow = rows[0]?.closest('.shagi-task-row');
    const completedRow = rows[1]?.closest('.shagi-task-row');
    expect(activeRow?.className).not.toContain('completed');
    expect(completedRow?.className).toContain('completed');
  });

  it('"ничего не найдено" при непустом запросе без совпадений — отдельно от M34', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Совсем другое' });
    renderSearch({ tasks: [task] });

    await user.type(await searchInput(), 'несуществующийзапрос');

    await waitFor(() =>
      expect(screen.getByText(t('search', 'noResults.title'))).toBeInTheDocument(),
    );
    expect(screen.queryByText(t('search', 'empty.title'))).not.toBeInTheDocument();
    expect(screen.queryByText('Совсем другое')).not.toBeInTheDocument();
  });
});

describe('Search — переходы по клику', () => {
  it('клик по результату-задаче открывает Task Detail (controller.openTask)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Открываемая задача' });
    const { controller } = renderSearch({ tasks: [task] });

    await user.type(await searchInput(), 'Открываемая задача');
    await waitFor(() => expect(screen.getByText('Открываемая задача')).toBeInTheDocument());
    await user.click(screen.getByText('Открываемая задача'));

    expect(controller.getState()).toEqual(
      expect.objectContaining({
        screen: 'taskDetail',
        selectedTaskId: task.id,
        returnScreen: 'search',
      }),
    );
  });

  it('клик по результату-проекту открывает Project Detail (controller.openProject)', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Открываемый проект' });
    const { controller } = renderSearch({ projects: [project] });

    await user.type(await searchInput(), 'Открываемый проект');
    await waitFor(() => expect(screen.getByText('Открываемый проект')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Открываемый проект' }));

    expect(controller.getState().screen).toBe('projectDetail');
    expect(controller.getState().selectedProjectId).toBe(project.id);
  });

  it('метки находятся поиском, но не кликабельны (вне объёма — нет экрана управления метками)', async () => {
    const user = userEvent.setup();
    const label = makeLabel({ displayName: 'Важное' });
    renderSearch({ labels: [label] });

    await user.type(await searchInput(), 'Важное');

    await waitFor(() => expect(screen.getByText('Важное')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Важное' })).not.toBeInTheDocument();
  });
});

describe('Search — денормализация project/label задачи (только для проверки, что кандидат собирается)', () => {
  it('находит задачу по названию проекта (уровень 5, 01§15)', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Уникальныйпроект' });
    const task = makeTask({ title: 'Задача без совпадения в заголовке', projectId: project.id });
    renderSearch({ projects: [project], tasks: [task] });

    await user.type(await searchInput(), 'Уникальныйпроект');

    await waitFor(() =>
      expect(screen.getByText('Задача без совпадения в заголовке')).toBeInTheDocument(),
    );
  });
});
