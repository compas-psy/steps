import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { makeOutboxEntry, makeProject, makeTask } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { Project, Task } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Inbox } from '../../src/screens/Inbox.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

async function seedTasks(storage: StoragePort, tasks: readonly Task[]): Promise<void> {
  for (const task of tasks) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: task }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });
  }
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
 * Тот же приём, что `Today.test.tsx` (`SeedThenTodayCapturing`) — сеет
 * задачи/проекты и монтирует `Inbox` только после завершения посева, на том
 * же инстансе `StoragePort`, который получает сам экран (`useStorage()`,
 * один на дерево `AppProvider`), и параллельно захватывает этот инстанс
 * наружу для проверки реального эффекта команд в хранилище.
 */
function SeedThenInboxCapturing({
  tasks,
  projects = [],
  onStorage,
}: {
  tasks: readonly Task[];
  projects?: readonly Project[];
  onStorage: (storage: StoragePort) => void;
}): ReactElement | null {
  const storage = useStorage();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    onStorage(storage);
  }, [storage, onStorage]);

  useEffect(() => {
    let cancelled = false;
    // Последовательно, не `Promise.all` — та же причина, что `Today.tsx`
    // документирует для своих последовательных вызовов команд:
    // `storage.runTransaction` каждой сеющей функции не проверялся на
    // параллельную безопасность нескольких одновременных транзакций на
    // одном инстансе хранилища, детерминированный порядок безопаснее.
    void seedProjects(storage, projects)
      .then(() => seedTasks(storage, tasks))
      .then(() => {
        if (!cancelled) setSeeded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- фиксировано на монтирование теста
  }, [storage]);

  return seeded ? <Inbox /> : null;
}

function renderInboxCapturingStorage(
  tasks: readonly Task[],
  projects: readonly Project[] = [],
): { getStorage: () => StoragePort; controller: ReturnType<typeof createAppController> } {
  const controller = createAppController({ screen: 'inbox' });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenInboxCapturing
        tasks={tasks}
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
    controller,
  };
}

const TODAY = Temporal.Now.plainDateISO();

describe('Inbox (M12/M13) — список', () => {
  it('показывает только задачи с capture_state=inbox, не processed', async () => {
    const inboxTask = makeTask({ title: 'Во входящих', captureState: 'inbox' });
    const processedTask = makeTask({ title: 'Уже разобрана', captureState: 'processed' });
    renderInboxCapturingStorage([inboxTask, processedTask]);

    await waitFor(() => expect(screen.getByText('Во входящих')).toBeInTheDocument());
    expect(screen.queryByText('Уже разобрана')).not.toBeInTheDocument();
  });

  it('M12 Inbox Zero: пустой список показывает EmptyState со спокойным текстом', async () => {
    renderInboxCapturingStorage([]);
    await waitFor(() => expect(screen.getByText(t('common', 'inbox.cleared'))).toBeInTheDocument());
  });

  it('кнопка «Назад» возвращает на Today (todayEmpty)', async () => {
    const task = makeTask({ title: 'Карточка', captureState: 'inbox' });
    const { controller } = renderInboxCapturingStorage([task]);
    await waitFor(() => expect(screen.getByText('Карточка')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('inbox', 'back.label') }));

    expect(controller.getState().screen).toBe('todayEmpty');
  });
});

describe('Inbox — действия карточки', () => {
  it('«Сегодня» ставит plannedDate=сегодня и captureState=processed — задача уходит из Входящих', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача А', captureState: 'inbox' });
    const { getStorage } = renderInboxCapturingStorage([task]);

    await waitFor(() => expect(screen.getByText('Задача А')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.today') }));

    await waitFor(() => expect(screen.getByText(t('common', 'inbox.cleared'))).toBeInTheDocument());

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.plannedDate).toEqual(TODAY);
    expect(stored?.captureState).toBe('processed');
  });

  it('«Дата» открывает DatePicker и переносит выбранную дату + processed', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача Б', captureState: 'inbox' });
    const { getStorage } = renderInboxCapturingStorage([task]);

    await waitFor(() => expect(screen.getByText('Задача Б')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.date') }));

    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);

    await waitFor(() => expect(screen.getByText(t('common', 'inbox.cleared'))).toBeInTheDocument());

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.plannedDate).toEqual(TODAY);
    expect(stored?.captureState).toBe('processed');
  });

  it('«Проект» со списком активных проектов назначает projectId + processed', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Мой проект' });
    const task = makeTask({ title: 'Задача В', captureState: 'inbox' });
    const { getStorage } = renderInboxCapturingStorage([task], [project]);

    await waitFor(() => expect(screen.getByText('Задача В')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.project') }));
    await user.click(screen.getByRole('menuitem', { name: 'Мой проект' }));

    await waitFor(() => expect(screen.getByText(t('common', 'inbox.cleared'))).toBeInTheDocument());

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.projectId).toBe(project.id);
    expect(stored?.captureState).toBe('processed');
    // Найдено при приёмке E09.1 (см. update-task.ts): единственный сегодня
    // реальный путь назначить проект ПОСЛЕ создания — без явной передачи
    // снимка здесь он остался бы `null` навсегда (01§12 "keeps project-name
    // snapshot after project deletion").
    expect(stored?.originalProjectNameSnapshot).toBe('Мой проект');
  });

  it('«Проект» при пустом списке проектов показывает недоступный пункт «Проектов пока нет», задача не тронута', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача Г', captureState: 'inbox' });
    const { getStorage } = renderInboxCapturingStorage([task], []);

    await waitFor(() => expect(screen.getByText('Задача Г')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.project') }));

    const emptyItem = await screen.findByRole('menuitem', {
      name: t('inbox', 'projectPicker.empty'),
    });
    expect(emptyItem).toBeDisabled();

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.captureState).toBe('inbox');
  });

  it('«Удалить» soft-удаляет задачу (tombstone) — пропадает из Входящих', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача Д', captureState: 'inbox' });
    const { getStorage } = renderInboxCapturingStorage([task]);

    await waitFor(() => expect(screen.getByText('Задача Д')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.delete') }));

    await waitFor(() => expect(screen.getByText(t('common', 'inbox.cleared'))).toBeInTheDocument());

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.deletedAt).not.toBeNull();
  });

  it('«Пропустить» НЕ вызывает команду — задача остаётся inbox, фокус переходит к следующей карточке', async () => {
    const user = userEvent.setup();
    const first = makeTask({ title: 'Первая', captureState: 'inbox' });
    const second = makeTask({ title: 'Вторая', captureState: 'inbox' });
    const { getStorage } = renderInboxCapturingStorage([first, second]);

    await waitFor(() =>
      expect(screen.queryByText('Первая') !== null || screen.queryByText('Вторая') !== null).toBe(
        true,
      ),
    );
    // Одна из двух задач показана как текущая карточка.
    const firstShown = screen.queryByText('Первая') !== null;
    const shownTitle = firstShown ? 'Первая' : 'Вторая';
    const otherTitle = firstShown ? 'Вторая' : 'Первая';
    expect(screen.getByText(shownTitle)).toBeInTheDocument();
    expect(screen.queryByText(otherTitle)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.skip') }));

    // Следующая карточка показана вместо пропущенной.
    await waitFor(() => expect(screen.getByText(otherTitle)).toBeInTheDocument());
    expect(screen.queryByText(shownTitle)).not.toBeInTheDocument();

    const storedFirst = await getStorage().tasks.findById(first.id);
    const storedSecond = await getStorage().tasks.findById(second.id);
    expect(storedFirst?.captureState).toBe('inbox');
    expect(storedSecond?.captureState).toBe('inbox');
  });

  it('провалившаяся команда (`not_found`) показывает ошибку и не трогает список молча', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Удалённая параллельно', captureState: 'inbox' });
    const { getStorage } = renderInboxCapturingStorage([task]);

    await waitFor(() => expect(screen.getByText('Удалённая параллельно')).toBeInTheDocument());

    await getStorage().runTransaction(async (tx) => {
      const current = await tx.tasks.findById(task.id);
      if (current === null) throw new Error('задача не найдена в тесте');
      await tx.applyMutation({
        writes: [{ entity: 'task', value: { ...current, deletedAt: Temporal.Now.instant() } }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });

    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.today') }));

    await waitFor(() =>
      expect(screen.getByText(t('inbox', 'errors.actionFailed'))).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Список не перезапрошен молча под ошибку — карточка провалившейся задачи остаётся видимой.
    expect(screen.getByText('Удалённая параллельно')).toBeInTheDocument();
  });
});

describe('Inbox — клик по карточке открывает Task Detail (E10.2)', () => {
  it('клик по заголовку карточки открывает taskDetail с selectedTaskId/returnScreen=inbox', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Открыть из Входящих', captureState: 'inbox' });
    const { controller } = renderInboxCapturingStorage([task]);

    await waitFor(() => expect(screen.getByText('Открыть из Входящих')).toBeInTheDocument());
    await user.click(screen.getByText('Открыть из Входящих'));

    expect(controller.getState()).toEqual(
      expect.objectContaining({
        screen: 'taskDetail',
        selectedTaskId: task.id,
        returnScreen: 'inbox',
      }),
    );
  });

  it('адверсариальная проверка: клик по кнопке «Сегодня» разбирает задачу, но НЕ открывает Task Detail', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Кнопка не открывает деталь', captureState: 'inbox' });
    const { controller, getStorage } = renderInboxCapturingStorage([task]);

    await waitFor(() => expect(screen.getByText('Кнопка не открывает деталь')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.today') }));

    // Эффект кнопки реально произошёл (иначе тест ничего не доказывал бы).
    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.captureState).toBe('processed');
    });
    // ...и при этом экран НЕ переключился на taskDetail.
    expect(controller.getState().screen).not.toBe('taskDetail');
    expect(controller.getState().selectedTaskId).toBeNull();
  });

  it('адверсариальная проверка: клик по кнопке «Пропустить» двигает очередь, но НЕ открывает Task Detail', async () => {
    const user = userEvent.setup();
    const first = makeTask({ title: 'Первая карточка', captureState: 'inbox' });
    const second = makeTask({ title: 'Вторая карточка', captureState: 'inbox' });
    const { controller } = renderInboxCapturingStorage([first, second]);

    await waitFor(() => expect(screen.getByText('Первая карточка')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('inbox', 'actions.skip') }));

    // Эффект «Пропустить» реально произошёл — фокус ушёл к следующей карточке.
    await waitFor(() => expect(screen.getByText('Вторая карточка')).toBeInTheDocument());
    // ...и при этом экран НЕ переключился на taskDetail.
    expect(controller.getState().screen).not.toBe('taskDetail');
    expect(controller.getState().selectedTaskId).toBeNull();
  });
});
