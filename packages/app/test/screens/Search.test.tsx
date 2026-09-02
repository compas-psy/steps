import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
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
import { makePriority, type Label, type Project, type Task } from '@shagi/core';
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

describe('Search — чекбокс в выдаче работает, а не украшает', () => {
  it('чекбокс активной задачи завершает её', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Оплатить интернет' });
    const { getStorage } = renderSearch({ tasks: [task] });
    await user.type(await searchInput(), 'интернет');

    const box = await screen.findByRole('checkbox', { name: 'Оплатить интернет' });
    expect(box).toBeEnabled();
    await user.click(box);

    // Раньше чекбокс здесь рендерился `disabled`: выглядел как везде и не
    // делал ничего. Тест обязан покраснеть, если это вернётся.
    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.status).toBe('completed');
    });
  });

  it('у завершённой задачи чекбокс намеренно неинтерактивен — снятие галочки это восстановление (M36)', async () => {
    const user = userEvent.setup();
    renderSearch({ tasks: [makeTask({ title: 'Уже сделана', status: 'completed' })] });
    await user.type(await searchInput(), 'сделана');

    expect(await screen.findByRole('checkbox', { name: 'Уже сделана' })).toBeDisabled();
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

// --- Системные фильтры (01§16, пакет работ E12.3) ---------------------------
//
// Размещение — встроено в M34 (calm empty state ДО ввода запроса), см.
// заголовок `Search.tsx`, блок «E12.3: Системные фильтры» за полным
// разбором решения. Пять чипов-фильтров видны только пока запрос пуст —
// те же условия, что уже проверяет `describe('Search — M34 Empty')` выше.

const NOW = Temporal.Now.plainDateTimeISO();
const TODAY = NOW.toPlainDate();
const YESTERDAY = TODAY.subtract({ days: 1 });

function filterChip(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
}

/** Дожидается, что чипы фильтров смонтированы — тот же класс гонки, что
 * `searchInput()` выше (async-загрузка кандидатов ещё не гарантирует, что
 * ЭТОТ конкретный компонент уже в DOM на первом кадре). */
async function waitForFilterChips(): Promise<void> {
  await waitFor(() => expect(filterChip(t('search', 'filters.noDate'))).toBeInTheDocument());
}

describe('Search — Системные фильтры, M34 (01§16, E12.3)', () => {
  it('в пустом состоянии видны все пять предопределённых фильтров', async () => {
    renderSearch();

    await waitForFilterChips();

    expect(filterChip(t('search', 'filters.noDate'))).toBeInTheDocument();
    expect(filterChip(t('search', 'filters.p1'))).toBeInTheDocument();
    expect(filterChip(t('search', 'filters.missedPlan'))).toBeInTheDocument();
    expect(filterChip(t('search', 'filters.missedDeadline'))).toBeInTheDocument();
    expect(filterChip(t('search', 'filters.recurring'))).toBeInTheDocument();
  });

  it('фильтры скрыты, как только запрос непустой — печать текста переключает на обычный поиск', async () => {
    const user = userEvent.setup();
    renderSearch();
    await waitForFilterChips();

    await user.type(await searchInput(), 'что угодно');

    expect(
      screen.queryByRole('button', { name: t('search', 'filters.noDate') }),
    ).not.toBeInTheDocument();
  });

  it('«Без даты» — активная задача без plannedDate и без deadlineDate', async () => {
    const user = userEvent.setup();
    const bare = makeTask({ title: 'Задача без дат' });
    const withDate = makeTask({ title: 'Задача с датой', plannedDate: TODAY.add({ days: 1 }) });
    renderSearch({ tasks: [bare, withDate] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.noDate')));

    await waitFor(() => expect(screen.getByText('Задача без дат')).toBeInTheDocument());
    expect(screen.queryByText('Задача с датой')).not.toBeInTheDocument();
  });

  it('«P1 / Критичные» — активная задача с priority=1', async () => {
    const user = userEvent.setup();
    const critical = { ...makeTask({ title: 'Критичная задача' }), priority: makePriority(1) };
    const normal = { ...makeTask({ title: 'Обычная задача' }), priority: makePriority(3) };
    renderSearch({ tasks: [critical, normal] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.p1')));

    await waitFor(() => expect(screen.getByText('Критичная задача')).toBeInTheDocument());
    expect(screen.queryByText('Обычная задача')).not.toBeInTheDocument();
  });

  it('«Не по плану» — активная задача с plannedDate в прошлом (переиспользует classifyTaskForToday)', async () => {
    const user = userEvent.setup();
    const missedPlan = makeTask({ title: 'Просроченный план', plannedDate: YESTERDAY });
    const onTrack = makeTask({ title: 'Задача в срок', plannedDate: TODAY });
    renderSearch({ tasks: [missedPlan, onTrack] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.missedPlan')));

    await waitFor(() => expect(screen.getByText('Просроченный план')).toBeInTheDocument());
    expect(screen.queryByText('Задача в срок')).not.toBeInTheDocument();
  });

  it('«Просрочен срок» — активная задача с deadlineDate в прошлом', async () => {
    const user = userEvent.setup();
    const missedDeadline = makeTask({ title: 'Просроченный срок', deadlineDate: YESTERDAY });
    const notYet = makeTask({ title: 'Ещё не просрочена', deadlineDate: TODAY.add({ days: 3 }) });
    renderSearch({ tasks: [missedDeadline, notYet] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.missedDeadline')));

    await waitFor(() => expect(screen.getByText('Просроченный срок')).toBeInTheDocument());
    expect(screen.queryByText('Ещё не просрочена')).not.toBeInTheDocument();
  });

  it('«Повторяющиеся» — активная задача с seriesId !== null', async () => {
    const user = userEvent.setup();
    const seriesId = makeTask().id; // произвольный, но валидный Uuid для seriesId.
    const recurring = makeTask({ title: 'Повторяющаяся задача', seriesId });
    const single = makeTask({ title: 'Обычная одноразовая' });
    renderSearch({ tasks: [recurring, single] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.recurring')));

    await waitFor(() => expect(screen.getByText('Повторяющаяся задача')).toBeInTheDocument());
    expect(screen.queryByText('Обычная одноразовая')).not.toBeInTheDocument();
  });

  it('завершённая задача не попадает ни в один фильтр, даже если формально подходит по всем полям', async () => {
    const user = userEvent.setup();
    const completed = makeTask({
      title: 'Завершённая критичная без дат',
      status: 'completed',
    });
    const completedCritical = { ...completed, priority: makePriority(1) };
    renderSearch({ tasks: [completedCritical] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.noDate')));
    await waitFor(() =>
      expect(screen.getByText(t('search', 'filters.empty.title'))).toBeInTheDocument(),
    );
    expect(screen.queryByText('Завершённая критичная без дат')).not.toBeInTheDocument();

    await user.click(filterChip(t('search', 'filters.noDate'))); // снять «Без даты»
    await user.click(filterChip(t('search', 'filters.p1')));
    await waitFor(() =>
      expect(screen.getByText(t('search', 'filters.empty.title'))).toBeInTheDocument(),
    );
    expect(screen.queryByText('Завершённая критичная без дат')).not.toBeInTheDocument();
  });

  it('переключение между фильтрами показывает правильный список для каждого', async () => {
    const user = userEvent.setup();
    const bare = makeTask({ title: 'Без единой даты' });
    const critical = {
      ...makeTask({ title: 'Критичная с датой', plannedDate: TODAY.add({ days: 2 }) }),
      priority: makePriority(1),
    };
    renderSearch({ tasks: [bare, critical] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.noDate')));
    await waitFor(() => expect(screen.getByText('Без единой даты')).toBeInTheDocument());
    expect(screen.queryByText('Критичная с датой')).not.toBeInTheDocument();

    await user.click(filterChip(t('search', 'filters.p1')));
    await waitFor(() => expect(screen.getByText('Критичная с датой')).toBeInTheDocument());
    expect(screen.queryByText('Без единой даты')).not.toBeInTheDocument();
  });

  it('повторный клик по выбранному фильтру снимает выбор — возвращает calm empty state', async () => {
    const user = userEvent.setup();
    const bare = makeTask({ title: 'Без единой даты' });
    renderSearch({ tasks: [bare] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.noDate')));
    await waitFor(() => expect(screen.getByText('Без единой даты')).toBeInTheDocument());

    await user.click(filterChip(t('search', 'filters.noDate')));
    await waitFor(() => expect(screen.getByText(t('search', 'empty.title'))).toBeInTheDocument());
    expect(screen.queryByText('Без единой даты')).not.toBeInTheDocument();
  });

  it('клик по задаче в результате фильтра открывает Task Detail (controller.openTask)', async () => {
    const user = userEvent.setup();
    const bare = makeTask({ title: 'Открыть из фильтра' });
    const { controller } = renderSearch({ tasks: [bare] });
    await waitForFilterChips();

    await user.click(filterChip(t('search', 'filters.noDate')));
    await waitFor(() => expect(screen.getByText('Открыть из фильтра')).toBeInTheDocument());
    await user.click(screen.getByText('Открыть из фильтра'));

    expect(controller.getState()).toEqual(
      expect.objectContaining({
        screen: 'taskDetail',
        selectedTaskId: bare.id,
        returnScreen: 'search',
      }),
    );
  });
});
