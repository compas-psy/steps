import { useEffect, useState, type ReactElement } from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { makeOutboxEntry, makeProject, makeTask } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { Project, RecurrenceSeries, Section, Task, Uuid } from '@shagi/core';
import { generateUuidV7, initialRank, makeOccurrenceSeq, rankAfter } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { ProjectDetail } from '../../src/screens/ProjectDetail.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

/** Секция как плоский объект `@shagi/core` `Section` — не через фикстуру
 * `makeSection` (`@shagi/storage/contract`): та фиксирует `title` жёстко
 * ('Проверочная секция'), а тестам этого экрана нужны РАЗЛИЧИМЫЕ заголовки
 * секций, чтобы проверять порядок отрисовки по тексту на экране. */
function section(projectId: Uuid, title: string, rank: Section['rank']): Section {
  return { id: generateUuidV7(), projectId, title, rank, deletedAt: null, clocks: {} };
}

async function seed(
  storage: StoragePort,
  entities: {
    projects?: readonly Project[];
    sections?: readonly Section[];
    tasks?: readonly Task[];
    recurrenceSeries?: readonly RecurrenceSeries[];
  },
): Promise<void> {
  for (const project of entities.projects ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'project', value: project }],
        outbox: [makeOutboxEntry('project', project.id)],
      });
    });
  }
  for (const sec of entities.sections ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'section', value: sec }],
        outbox: [makeOutboxEntry('section', sec.id)],
      });
    });
  }
  // Серии — ДО задач: `recurrenceSeries` фикстура ниже задаёт `task.seriesId`
  // на уже существующую серию (тот же порядок, что и `createRecurringTask
  // Command` в проде — см. её комментарий про безвредную осиротевшую серию
  // vs опасную задачу-в-никуда).
  for (const series of entities.recurrenceSeries ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'recurrence_series', value: series }],
        outbox: [makeOutboxEntry('recurrence_series', series.id)],
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

/** См. `Today.test.tsx` за тем же обоснованием узкой фикстуры-дублёра. */
function seedRecurrenceSeries(
  overrides: Partial<
    Omit<RecurrenceSeries, 'anchorType' | 'rrule' | 'completionIntervalJson'>
  > = {},
): RecurrenceSeries {
  const now = Temporal.Now.instant();
  return {
    id: generateUuidV7(),
    anchorType: 'scheduled',
    rrule: JSON.stringify({ unit: 'day', interval: 1 }),
    completionIntervalJson: null,
    templateJson: { unit: 'day', interval: 1 },
    active: true,
    nextOccurrenceSeq: makeOccurrenceSeq(2n),
    stopAfterOccurrenceSeq: null,
    templateRevision: 1n,
    createdAt: now,
    updatedAt: now,
    clocks: {},
    ...overrides,
  };
}

/** Тот же приём захвата `storage`, что `Inbox.test.tsx`/`Projects.test.tsx`
 * — сеет данные и монтирует экран только ПОСЛЕ завершения посева, на том же
 * инстансе `StoragePort`, который получает сам экран. */
function SeedThenProjectDetailCapturing({
  projects,
  sections = [],
  tasks = [],
  recurrenceSeries = [],
  onStorage,
}: {
  projects: readonly Project[];
  sections?: readonly Section[];
  tasks?: readonly Task[];
  recurrenceSeries?: readonly RecurrenceSeries[];
  onStorage: (storage: StoragePort) => void;
}): ReactElement | null {
  const storage = useStorage();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    onStorage(storage);
  }, [storage, onStorage]);

  useEffect(() => {
    let cancelled = false;
    void seed(storage, { projects, sections, tasks, recurrenceSeries }).then(() => {
      if (!cancelled) setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- фиксировано на монтирование теста
  }, [storage]);

  return seeded ? <ProjectDetail /> : null;
}

function renderProjectDetail(
  project: Project,
  sections: readonly Section[] = [],
  tasks: readonly Task[] = [],
  recurrenceSeries: readonly RecurrenceSeries[] = [],
): { getStorage: () => StoragePort; controller: ReturnType<typeof createAppController> } {
  const controller = createAppController({
    screen: 'projectDetail',
    selectedProjectId: project.id,
  });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenProjectDetailCapturing
        projects={[project]}
        sections={sections}
        tasks={tasks}
        recurrenceSeries={recurrenceSeries}
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

describe('ProjectDetail (M17/M18) — порядок секций', () => {
  it('List: реальные секции по rank, «Без раздела» первой, если непуста', async () => {
    const project = makeProject({ title: 'Проект А' });
    const rankA = initialRank();
    const rankB = rankAfter(rankA);
    const sectionA = section(project.id, 'Идеи', rankA);
    const sectionB = section(project.id, 'Сделать', rankB);
    const noSectionTask = makeTask({ title: 'Без раздела задача', projectId: project.id });
    const taskA = makeTask({
      title: 'Задача из Идей',
      projectId: project.id,
      sectionId: sectionA.id,
    });
    const taskB = makeTask({
      title: 'Задача из Сделать',
      projectId: project.id,
      sectionId: sectionB.id,
    });
    renderProjectDetail(project, [sectionA, sectionB], [noSectionTask, taskA, taskB]);

    await waitFor(() => expect(screen.getByText('Идеи')).toBeInTheDocument());

    const sectionIds = [sectionA.id, sectionB.id];
    const sectionTestIds = ['section-__none__', ...sectionIds.map((id) => `section-${id}`)];
    const order = screen.getAllByTestId(/^section-/).map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual(sectionTestIds);
  });

  it('List: «Без раздела» скрыта, когда в ней нет активных задач', async () => {
    const project = makeProject({ title: 'Проект Б' });
    const sectionA = section(project.id, 'Идеи', initialRank());
    const taskA = makeTask({
      title: 'Задача из Идей',
      projectId: project.id,
      sectionId: sectionA.id,
    });
    renderProjectDetail(project, [sectionA], [taskA]);

    await waitFor(() => expect(screen.getByText('Идеи')).toBeInTheDocument());
    expect(screen.queryByText(t('projectDetail', 'sections.none'))).not.toBeInTheDocument();
  });

  it('User-created пустая секция остаётся видимой (§12: «remains visible»)', async () => {
    const project = makeProject({ title: 'Проект В' });
    const emptySection = section(project.id, 'Пустой раздел', initialRank());
    renderProjectDetail(project, [emptySection], []);

    await waitFor(() => expect(screen.getByText('Пустой раздел')).toBeInTheDocument());
  });

  it('Board: те же секции колонками, тот же порядок', async () => {
    const project = { ...makeProject({ title: 'Проект Г' }), defaultView: 'board' as const };
    const sectionA = section(project.id, 'Идеи', initialRank());
    const noSectionTask = makeTask({ title: 'Карточка без раздела', projectId: project.id });
    const taskA = makeTask({
      title: 'Карточка Идей',
      projectId: project.id,
      sectionId: sectionA.id,
    });
    renderProjectDetail(project, [sectionA], [noSectionTask, taskA]);

    await waitFor(() => expect(screen.getAllByTestId('board-column')).toHaveLength(2));
    const columns = screen.getAllByTestId('board-column');
    expect(
      within(columns[0] as HTMLElement).getByText(t('projectDetail', 'sections.none')),
    ).toBeInTheDocument();
    expect(within(columns[1] as HTMLElement).getByText('Идеи')).toBeInTheDocument();
  });
});

describe('ProjectDetail — переключатель List/Board', () => {
  it('стартует со значения project.defaultView и переключается локально', async () => {
    const project = makeProject({ title: 'Проект Д' });
    const task = makeTask({ title: 'Единственная задача', projectId: project.id });
    renderProjectDetail(project, [], [task]);

    await waitFor(() => expect(screen.getByText('Единственная задача')).toBeInTheDocument());
    // List по умолчанию (makeProject → defaultView 'list') — доски ещё нет.
    expect(screen.queryByTestId('board-column')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: t('projectDetail', 'view.board') }));

    await waitFor(() => expect(screen.getByTestId('board-column')).toBeInTheDocument());
  });
});

describe('ProjectDetail — M19 Project Empty', () => {
  it('ноль активных задач во всех секциях → EmptyState с CTA', async () => {
    const project = makeProject({ title: 'Пустой проект' });
    renderProjectDetail(project, [], []);

    await waitFor(() =>
      expect(screen.getByText(t('projectDetail', 'empty.title'))).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: t('projectDetail', 'empty.cta') }),
    ).toBeInTheDocument();
  });
});

describe('ProjectDetail — действия меню задачи', () => {
  it('«Завершить» вызывает completeTaskCommand — задача пропадает из активного списка', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект Ж' });
    const task = makeTask({ title: 'Готовим ужин', projectId: project.id });
    const { getStorage } = renderProjectDetail(project, [], [task]);

    await waitFor(() => expect(screen.getByText('Готовим ужин')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('projectDetail', 'menu.triggerLabel', { title: 'Готовим ужин' }),
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: t('projectDetail', 'actions.complete') }),
    );

    await waitFor(() => expect(screen.queryByText('Готовим ужин')).not.toBeInTheDocument());
    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.status).toBe('completed');
  });

  it('«Удалить» soft-удаляет задачу (tombstone) — пропадает из списка', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект З' });
    const task = makeTask({ title: 'Устаревшая задача', projectId: project.id });
    const { getStorage } = renderProjectDetail(project, [], [task]);

    await waitFor(() => expect(screen.getByText('Устаревшая задача')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('projectDetail', 'menu.triggerLabel', { title: 'Устаревшая задача' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('projectDetail', 'actions.delete') }));

    await waitFor(() => expect(screen.queryByText('Устаревшая задача')).not.toBeInTheDocument());
    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.deletedAt).not.toBeNull();
  });

  it('«Переместить в раздел» — доступная альтернатива drag, задача уходит в конец выбранной секции', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект И' });
    const target = section(project.id, 'Целевой раздел', initialRank());
    const existingInTarget = makeTask({
      title: 'Уже в целевом',
      projectId: project.id,
      sectionId: target.id,
    });
    const task = makeTask({ title: 'Мобильная задача', projectId: project.id });
    const { getStorage } = renderProjectDetail(project, [target], [existingInTarget, task]);

    await waitFor(() => expect(screen.getByText('Мобильная задача')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('projectDetail', 'menu.triggerLabel', { title: 'Мобильная задача' }),
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: t('projectDetail', 'actions.moveToSection') }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: t('projectDetail', 'moveDialog.title'),
    });
    await user.click(within(dialog).getByRole('button', { name: 'Целевой раздел' }));

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.sectionId).toBe(target.id);
    });
    const movedTask = await getStorage().tasks.findById(task.id);
    const existingTask = await getStorage().tasks.findById(existingInTarget.id);
    // «В конец» — ранг перемещённой задачи больше ранга уже стоявшей в секции.
    expect((movedTask?.rank ?? '') > (existingTask?.rank ?? '')).toBe(true);
  });
});

describe('ProjectDetail — drag-and-drop (§13)', () => {
  it('drag внутри секции (drop на другую задачу) → updateTaskCommand с рангом ПЕРЕД целью, sectionId не меняется', async () => {
    const project = makeProject({ title: 'Проект Л' });
    const first = makeTask({ title: 'Первая задача', projectId: project.id, rank: initialRank() });
    const second = makeTask({
      title: 'Вторая задача',
      projectId: project.id,
      rank: rankAfter(initialRank()),
    });
    const { getStorage } = renderProjectDetail(project, [], [first, second]);

    await waitFor(() => expect(screen.getByText('Вторая задача')).toBeInTheDocument());

    const secondRow = screen.getByTestId(`task-row-${second.id}`);
    const firstRow = screen.getByTestId(`task-row-${first.id}`);
    fireEvent.dragStart(secondRow);
    fireEvent.dragOver(firstRow);
    fireEvent.drop(firstRow);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(second.id);
      expect(stored?.rank).not.toBe(rankAfter(initialRank()));
    });
    const storedSecond = await getStorage().tasks.findById(second.id);
    const storedFirst = await getStorage().tasks.findById(first.id);
    expect(storedSecond?.sectionId).toBeNull();
    expect((storedSecond?.rank ?? '') < (storedFirst?.rank ?? '')).toBe(true);
  });

  it('drag между секциями (drop на колонку/секцию) → updateTaskCommand с новым sectionId + rank', async () => {
    const project = makeProject({ title: 'Проект М' });
    const target = section(project.id, 'Целевая секция', initialRank());
    const task = makeTask({ title: 'Мигрирующая задача', projectId: project.id });
    const { getStorage } = renderProjectDetail(project, [target], [task]);

    await waitFor(() => expect(screen.getByText('Мигрирующая задача')).toBeInTheDocument());

    const taskRow = screen.getByTestId(`task-row-${task.id}`);
    const targetSection = screen.getByTestId(`section-${target.id}`);
    fireEvent.dragStart(taskRow);
    fireEvent.dragOver(targetSection);
    fireEvent.drop(targetSection);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.sectionId).toBe(target.id);
    });
  });
});

describe('ProjectDetail — инлайн-добавление задачи', () => {
  it('Enter создаёт задачу через createTaskCommand с captureState=processed и project context (§3)', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект К' });
    renderProjectDetail(project, [], []);

    await waitFor(() =>
      expect(screen.getByText(t('projectDetail', 'empty.title'))).toBeInTheDocument(),
    );
    const input = screen.getByLabelText(
      t('projectDetail', 'inlineAdd.label', { section: t('projectDetail', 'sections.none') }),
    );
    await user.type(input, 'Новая задача{Enter}');

    await waitFor(() => expect(screen.getByText('Новая задача')).toBeInTheDocument());
  });
});

describe('ProjectDetail — навигация', () => {
  it('кнопка «Назад» возвращает на список проектов', async () => {
    const project = makeProject({ title: 'Проект Е' });
    const { controller } = renderProjectDetail(project, [], []);

    await waitFor(() => expect(screen.getByText('Проект Е')).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: t('projectDetail', 'back.label') }));

    expect(controller.getState().screen).toBe('projects');
  });

  it('заголовок ProjectHeader показывает название проекта', async () => {
    const project = makeProject({ title: 'Ремонт кухни' });
    renderProjectDetail(project, [], []);
    await waitFor(() => expect(screen.getByText('Ремонт кухни')).toBeInTheDocument());
  });
});

describe('ProjectDetail — клик по строке/карточке открывает Task Detail (E10.2)', () => {
  it('List: клик по заголовку строки открывает taskDetail с selectedTaskId/returnScreen=projectDetail', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект Н' });
    const task = makeTask({ title: 'Открыть строку', projectId: project.id });
    const { controller } = renderProjectDetail(project, [], [task]);

    await waitFor(() => expect(screen.getByText('Открыть строку')).toBeInTheDocument());
    await user.click(screen.getByText('Открыть строку'));

    expect(controller.getState()).toEqual(
      expect.objectContaining({
        screen: 'taskDetail',
        selectedTaskId: task.id,
        returnScreen: 'projectDetail',
      }),
    );
  });

  it('адверсариальная проверка (List): клик по чекбоксу строки завершает задачу, но НЕ открывает Task Detail', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект О' });
    const task = makeTask({ title: 'Не открывать по чекбоксу', projectId: project.id });
    const { controller, getStorage } = renderProjectDetail(project, [], [task]);

    await waitFor(() => expect(screen.getByText('Не открывать по чекбоксу')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Не открывать по чекбоксу' }));

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.status).toBe('completed');
    });
    expect(controller.getState().screen).not.toBe('taskDetail');
    expect(controller.getState().selectedTaskId).toBeNull();
  });

  it('адверсариальная проверка (List): клик по кнопке меню строки открывает меню, но НЕ открывает Task Detail', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект П' });
    const task = makeTask({ title: 'Меню не открывает деталь', projectId: project.id });
    const { controller } = renderProjectDetail(project, [], [task]);

    await waitFor(() => expect(screen.getByText('Меню не открывает деталь')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('projectDetail', 'menu.triggerLabel', { title: 'Меню не открывает деталь' }),
      }),
    );

    expect(
      screen.getByRole('menuitem', { name: t('projectDetail', 'actions.complete') }),
    ).toBeInTheDocument();
    expect(controller.getState().screen).not.toBe('taskDetail');
    expect(controller.getState().selectedTaskId).toBeNull();
  });

  it('Board: клик по карточке открывает taskDetail', async () => {
    const user = userEvent.setup();
    const project = { ...makeProject({ title: 'Проект Р' }), defaultView: 'board' as const };
    const task = makeTask({ title: 'Открыть карточку', projectId: project.id });
    const { controller } = renderProjectDetail(project, [], [task]);

    await waitFor(() => expect(screen.getByText('Открыть карточку')).toBeInTheDocument());
    await user.click(screen.getByText('Открыть карточку'));

    expect(controller.getState()).toEqual(
      expect.objectContaining({
        screen: 'taskDetail',
        selectedTaskId: task.id,
        returnScreen: 'projectDetail',
      }),
    );
  });

  it('адверсариальная проверка (Board): клик по кнопке меню карточки открывает меню, но НЕ открывает Task Detail', async () => {
    const user = userEvent.setup();
    const project = { ...makeProject({ title: 'Проект С' }), defaultView: 'board' as const };
    const task = makeTask({ title: 'Меню карточки', projectId: project.id });
    const { controller } = renderProjectDetail(project, [], [task]);

    await waitFor(() => expect(screen.getByText('Меню карточки')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('projectDetail', 'menu.triggerLabel', { title: 'Меню карточки' }),
      }),
    );

    expect(
      screen.getByRole('menuitem', { name: t('projectDetail', 'actions.complete') }),
    ).toBeInTheDocument();
    expect(controller.getState().screen).not.toBe('taskDetail');
    expect(controller.getState().selectedTaskId).toBeNull();
  });
});

describe('ProjectDetail — CRUD секций (E09.4)', () => {
  it('форма создания раздела — новый раздел появляется в списке (List)', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект Т1' });
    const { getStorage } = renderProjectDetail(project, [], []);

    await waitFor(() =>
      expect(screen.getByText(t('projectDetail', 'empty.title'))).toBeInTheDocument(),
    );

    await user.type(
      screen.getByLabelText(t('projectDetail', 'sections.createLabel')),
      'Новый раздел',
    );
    await user.click(
      screen.getByRole('button', { name: t('projectDetail', 'sections.createSubmit') }),
    );

    await waitFor(() => expect(screen.getByText('Новый раздел')).toBeInTheDocument());
    const stored = await getStorage().sections.listByProject(project.id);
    expect(stored.map((s) => s.title)).toContain('Новый раздел');
  });

  it('форма создания раздела видна и в Board', async () => {
    const user = userEvent.setup();
    const project = { ...makeProject({ title: 'Проект Т2' }), defaultView: 'board' as const };
    renderProjectDetail(project, [], []);

    await waitFor(() =>
      expect(screen.getByLabelText(t('projectDetail', 'sections.createLabel'))).toBeInTheDocument(),
    );
    await user.type(
      screen.getByLabelText(t('projectDetail', 'sections.createLabel')),
      'Раздел в доске',
    );
    await user.click(
      screen.getByRole('button', { name: t('projectDetail', 'sections.createSubmit') }),
    );

    await waitFor(() => expect(screen.getByText('Раздел в доске')).toBeInTheDocument());
  });

  it('переименование раздела сохраняется через updateSectionCommand', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект Т3' });
    const sec = section(project.id, 'Старое имя', initialRank());
    const { getStorage } = renderProjectDetail(project, [sec], []);

    await waitFor(() => expect(screen.getByText('Старое имя')).toBeInTheDocument());
    await user.click(screen.getByText('Старое имя'));
    const input = screen.getByLabelText(
      t('projectDetail', 'sections.renameFieldLabel', { title: 'Старое имя' }),
    );
    await user.clear(input);
    await user.type(input, 'Новое имя');
    await user.tab();

    await waitFor(async () => {
      const stored = await getStorage().sections.findById(sec.id);
      expect(stored?.title).toBe('Новое имя');
    });
    expect(screen.getByText('Новое имя')).toBeInTheDocument();
  });

  it('пустой заголовок при переименовании — блокирующая ошибка у поля, раздел не меняется', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект Т4' });
    const sec = section(project.id, 'Раздел', initialRank());
    const { getStorage } = renderProjectDetail(project, [sec], []);

    await waitFor(() => expect(screen.getByText('Раздел')).toBeInTheDocument());
    await user.click(screen.getByText('Раздел'));
    const input = screen.getByLabelText(
      t('projectDetail', 'sections.renameFieldLabel', { title: 'Раздел' }),
    );
    await user.clear(input);
    await user.tab();

    await waitFor(() =>
      expect(
        screen.getByText(t('projectDetail', 'sections.errors.titleInvalid')),
      ).toBeInTheDocument(),
    );
    const stored = await getStorage().sections.findById(sec.id);
    expect(stored?.title).toBe('Раздел');
  });

  it('удаление раздела требует подтверждения — без подтверждения раздел остаётся', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект Т5' });
    const sec = section(project.id, 'Удаляемый', initialRank());
    const { getStorage } = renderProjectDetail(project, [sec], []);

    await waitFor(() => expect(screen.getByText('Удаляемый')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('projectDetail', 'sections.deleteLabel', { title: 'Удаляемый' }),
      }),
    );
    await screen.findByRole('dialog', { name: t('projectDetail', 'sections.deleteConfirmTitle') });
    await user.click(
      screen.getByRole('button', { name: t('projectDetail', 'sections.deleteConfirmCancel') }),
    );

    expect(screen.getByText('Удаляемый')).toBeInTheDocument();
    const stored = await getStorage().sections.findById(sec.id);
    expect(stored?.deletedAt).toBeNull();
  });

  it('удаление раздела (после подтверждения) переносит задачи в «Без раздела»', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект Т6' });
    const sec = section(project.id, 'Раздел с задачей', initialRank());
    const task = makeTask({ title: 'Задача внутри', projectId: project.id, sectionId: sec.id });
    const { getStorage } = renderProjectDetail(project, [sec], [task]);

    await waitFor(() => expect(screen.getByText('Задача внутри')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('projectDetail', 'sections.deleteLabel', { title: 'Раздел с задачей' }),
      }),
    );
    await screen.findByRole('dialog', { name: t('projectDetail', 'sections.deleteConfirmTitle') });
    await user.click(
      screen.getByRole('button', { name: t('projectDetail', 'sections.deleteConfirmConfirm') }),
    );

    await waitFor(() => expect(screen.queryByText('Раздел с задачей')).not.toBeInTheDocument());
    const storedTask = await getStorage().tasks.findById(task.id);
    expect(storedTask?.sectionId).toBeNull();
    const storedSection = await getStorage().sections.findById(sec.id);
    expect(storedSection?.deletedAt).not.toBeNull();

    const noneSection = screen.getByTestId('section-__none__');
    expect(within(noneSection).getByText('Задача внутри')).toBeInTheDocument();
  });

  it('drag заголовка секции меняет порядок (новый rank в хранилище)', async () => {
    const project = makeProject({ title: 'Проект Т7' });
    const rankA = initialRank();
    const rankB = rankAfter(rankA);
    const sectionA = section(project.id, 'Раздел А', rankA);
    const sectionB = section(project.id, 'Раздел Б', rankB);
    const { getStorage } = renderProjectDetail(project, [sectionA, sectionB], []);

    await waitFor(() => expect(screen.getByText('Раздел Б')).toBeInTheDocument());

    const dragB = screen.getByTestId(`sectionDrag-${sectionB.id}`);
    const dragA = screen.getByTestId(`sectionDrag-${sectionA.id}`);
    fireEvent.dragStart(dragB);
    fireEvent.dragOver(dragA);
    fireEvent.drop(dragA);

    await waitFor(async () => {
      const storedB = await getStorage().sections.findById(sectionB.id);
      const storedA = await getStorage().sections.findById(sectionA.id);
      expect((storedB?.rank ?? '') < (storedA?.rank ?? '')).toBe(true);
    });
  });

  it('кнопки «Переместить вверх/вниз» переставляют раздел с соседом', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект Т8' });
    const rankA = initialRank();
    const rankB = rankAfter(rankA);
    const rankC = rankAfter(rankB);
    const sectionA = section(project.id, 'Раздел А', rankA);
    const sectionB = section(project.id, 'Раздел Б', rankB);
    const sectionC = section(project.id, 'Раздел В', rankC);
    const { getStorage } = renderProjectDetail(project, [sectionA, sectionB, sectionC], []);

    await waitFor(() => expect(screen.getByText('Раздел В')).toBeInTheDocument());

    const rowA = screen.getByTestId(`section-${sectionA.id}`);
    await user.click(
      within(rowA).getByRole('button', { name: t('projectDetail', 'sections.moveDown') }),
    );

    await waitFor(async () => {
      const storedA = await getStorage().sections.findById(sectionA.id);
      const storedB = await getStorage().sections.findById(sectionB.id);
      expect((storedA?.rank ?? '') > (storedB?.rank ?? '')).toBe(true);
    });
  });

  it('«Без раздела» не имеет кнопок переименования/удаления/reorder', async () => {
    const project = makeProject({ title: 'Проект Т9' });
    const sec = section(project.id, 'Единственный раздел', initialRank());
    const noSectionTask = makeTask({ title: 'Задача без раздела', projectId: project.id });
    renderProjectDetail(project, [sec], [noSectionTask]);

    await waitFor(() => expect(screen.getByText('Задача без раздела')).toBeInTheDocument());
    const noneSection = screen.getByTestId('section-__none__');
    expect(
      within(noneSection).queryByRole('button', { name: t('projectDetail', 'sections.moveUp') }),
    ).not.toBeInTheDocument();
    expect(
      within(noneSection).queryByRole('button', {
        name: t('projectDetail', 'sections.moveDown'),
      }),
    ).not.toBeInTheDocument();
    expect(within(noneSection).queryByTestId(/^sectionDrag-/)).not.toBeInTheDocument();
  });
});

describe('ProjectDetail — повторы (E11.2)', () => {
  it('«Завершить» на recurring-задаче вызывает completeOccurrenceCommand и генерирует следующий occurrence', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект с повтором' });
    const series = seedRecurrenceSeries();
    const today = Temporal.Now.plainDateISO();
    const task = makeTask({
      title: 'Полить цветы в проекте',
      projectId: project.id,
      plannedDate: today,
      seriesId: series.id,
      occurrenceSeq: 1n,
    });
    const { getStorage } = renderProjectDetail(project, [], [task], [series]);

    await waitFor(() => expect(screen.getByText('Полить цветы в проекте')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('projectDetail', 'menu.triggerLabel', { title: 'Полить цветы в проекте' }),
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: t('projectDetail', 'actions.complete') }),
    );

    // Текст заголовка НЕ пропадает со страницы (в отличие от обычной
    // задачи) — следующий occurrence наследует тот же `title` и остаётся
    // активным в том же проекте (`01§11.1`/`01§11.7`), поэтому регрессия
    // тут проверяется через хранилище, не через исчезновение текста.
    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.status).toBe('completed');
    });

    const nextOccurrences = await getStorage().tasks.listBySeries(series.id, 'active');
    expect(nextOccurrences).toHaveLength(1);
    expect(nextOccurrences[0]?.plannedDate?.toString()).toBe(today.add({ days: 1 }).toString());
  });
});
