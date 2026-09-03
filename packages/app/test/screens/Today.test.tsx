import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import {
  createUnavailablePlatform,
  type NotificationPrecision,
  type NotificationSchedulerPort,
} from '@shagi/platform';
import { formatDate, t } from '@shagi/i18n';
import { makeExplicitReminder, makeOutboxEntry, makeTask } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import { generateUuidV7, makeOccurrenceSeq, type RecurrenceSeries, type Task } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Today } from '../../src/screens/Today.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

/** Тот же фейк, что `test/state/reminder-reconciliation.test.ts` (Task A3).
 * `initialScheduled` — см. `TaskDetail.test.tsx` за тем же обоснованием. */
function fakeScheduler(initialScheduled: readonly string[] = []): NotificationSchedulerPort & {
  calls: { scheduled: string[]; cancelled: string[] };
} {
  const scheduled = new Set<string>(initialScheduled);
  const calls = { scheduled: [] as string[], cancelled: [] as string[] };
  return {
    calls,
    async schedule(id) {
      scheduled.add(id);
      calls.scheduled.push(id);
    },
    async cancel(id) {
      scheduled.delete(id);
      calls.cancelled.push(id);
    },
    async listScheduled() {
      return Array.from(scheduled);
    },
    async getSchedulingCapability(): Promise<NotificationPrecision> {
      return 'exact';
    },
  };
}

/** Пишет напоминание напрямую в хранилище — та же техника, что
 * `TaskDetail.test.tsx` `seedReminder` (см. её комментарий). */
async function seedReminder(
  storage: StoragePort,
  reminder: ReturnType<typeof makeExplicitReminder>,
): Promise<void> {
  await storage.runTransaction(async (tx) => {
    await tx.applyMutation({
      writes: [{ entity: 'reminder', value: reminder }],
      outbox: [makeOutboxEntry('reminder', reminder.id)],
    });
  });
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

/** Узкая фикстура `RecurrenceSeries` для тестов E11.2 этого экрана — та же
 * причина, что у остальных дублированных хелперов файла (`getDeviceId` и
 * т.п. по всему дереву пакетов): общей фикстуры для этой сущности в
 * `@shagi/storage/contract` пока нет, заводить её вне территории этого
 * пакета работ не нужно ради трёх экранных тестовых файлов. Значения по
 * умолчанию — минимальная валидная серия `unit:'day', interval:1,
 * anchorType:'scheduled'`, ещё не исчерпавшая себя (`active:true`,
 * `stopAfterOccurrenceSeq:null`), `nextOccurrenceSeq:2` — тот же инвариант,
 * что `createRecurringTaskCommand` устанавливает после материализации
 * occurrence 1 (см. его комментарий).
 */
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

async function seedSeries(
  storage: StoragePort,
  series: readonly RecurrenceSeries[],
): Promise<void> {
  for (const s of series) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'recurrence_series', value: s }],
        outbox: [makeOutboxEntry('recurrence_series', s.id)],
      });
    });
  }
}

/**
 * Сеет задачи через `storage.runTransaction`/`applyMutation` (единственный
 * легальный вход мутации, `@shagi/storage`) и монтирует `Today` только
 * ПОСЛЕ того, как посев завершился — обе стороны идут через один и тот же
 * инстанс `StoragePort`, потому что `useStorage()` резолвится один раз на
 * дерево `AppProvider` (`state/context.tsx`, `useMemo` по `host.storageBackend`).
 * Монтировать `Today` до завершения посева означало бы гонку: его
 * собственный `useEffect` мог бы прочитать хранилище раньше, чем задачи в
 * него попали.
 */
function SeedThenToday({ tasks }: { tasks: readonly Task[] }): ReactElement | null {
  const storage = useStorage();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void seedTasks(storage, tasks).then(() => {
      if (!cancelled) setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tasks` фиксирован на монтирование теста, не меняется между рендерами
  }, [storage]);

  return seeded ? <Today /> : null;
}

function renderToday(tasks: readonly Task[] = []): void {
  const controller = createAppController({ screen: 'todayEmpty' });
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenToday tasks={tasks} />
    </AppProvider>,
  );
}

/**
 * Тот же приём захвата `storage`, что `FirstTask.test.tsx` (`Harness`):
 * сеет задачи и монтирует `Today` на одном и том же инстансе `StoragePort`,
 * который получает сам экран (`useStorage()`, один на дерево `AppProvider`),
 * и параллельно отдаёт этот инстанс наружу — тесты действий проверяют
 * реальный эффект команды в хранилище, а не только то, что экран
 * перерисовался.
 */
function SeedThenTodayCapturing({
  tasks,
  onStorage,
}: {
  tasks: readonly Task[];
  onStorage: (storage: StoragePort) => void;
}): ReactElement | null {
  const storage = useStorage();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    onStorage(storage);
  }, [storage, onStorage]);

  useEffect(() => {
    let cancelled = false;
    void seedTasks(storage, tasks).then(() => {
      if (!cancelled) setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tasks` фиксирован на монтирование теста, не меняется между рендерами
  }, [storage]);

  return seeded ? <Today /> : null;
}

function renderTodayCapturingStorage(
  tasks: readonly Task[],
  host: AppHost = testHost(),
): () => StoragePort {
  const controller = createAppController({ screen: 'todayEmpty' });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={host} controller={controller}>
      <SeedThenTodayCapturing tasks={tasks} onStorage={(storage) => (capturedStorage = storage)} />
    </AppProvider>,
  );
  return () => {
    if (capturedStorage === undefined)
      throw new Error('storage не захвачен — компонент не смонтировался');
    return capturedStorage;
  };
}

/** Тот же приём, что `renderTodayCapturingStorage`, плюс наружу отдаётся сам
 * `controller` — тесты бейджа Входящих (см. заголовок `Today.tsx`, блок
 * «Бейдж Входящих») проверяют переход экрана по клику, `renderTodayCapturingStorage`
 * этого не отдаёт и оставлена нетронутой (задание — точечная правка). */
function renderTodayWithController(tasks: readonly Task[]): {
  getStorage: () => StoragePort;
  controller: ReturnType<typeof createAppController>;
} {
  const controller = createAppController({ screen: 'todayEmpty' });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenTodayCapturing tasks={tasks} onStorage={(storage) => (capturedStorage = storage)} />
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

/** Тот же приём, что `renderTodayCapturingStorage`, плюс посев
 * `RecurrenceSeries` — нужна только тестам E11.2 (описанным ниже), не
 * тронута сама `renderTodayCapturingStorage` (задание — точечная правка). */
function renderTodayCapturingStorageWithSeries(
  tasks: readonly Task[],
  series: readonly RecurrenceSeries[],
): () => StoragePort {
  const controller = createAppController({ screen: 'todayEmpty' });
  let capturedStorage: StoragePort | undefined;

  function SeedThenTodayWithSeries(): ReactElement | null {
    const storage = useStorage();
    const [seeded, setSeeded] = useState(false);

    useEffect(() => {
      capturedStorage = storage;
    }, [storage]);

    useEffect(() => {
      let cancelled = false;
      void seedSeries(storage, series)
        .then(() => seedTasks(storage, tasks))
        .then(() => {
          if (!cancelled) setSeeded(true);
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- фиксировано на монтирование теста
    }, [storage]);

    return seeded ? <Today /> : null;
  }

  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenTodayWithSeries />
    </AppProvider>,
  );
  return () => {
    if (capturedStorage === undefined)
      throw new Error('storage не захвачен — компонент не смонтировался');
    return capturedStorage;
  };
}

const NOW = Temporal.Now.plainDateTimeISO();
const TODAY = NOW.toPlainDate();
const YESTERDAY = TODAY.subtract({ days: 1 });
const TOMORROW = TODAY.add({ days: 1 });

/**
 * Заголовок группы "Сегодня" (`today.groups.today`) текстуально совпадает с
 * заголовком страницы (`today.pageTitle`) — оба буквально "Сегодня", это
 * осмысленное совпадение (группа "Сегодня" из `01§6` действительно так
 * называется), не опечатка каталога. Поэтому здесь — поиск ИМЕННО
 * `<h2>`-заголовка группы (`getByRole('heading', level: 2)`), а не голый
 * `getByText`, который иначе неоднозначен между `<h1>` страницы и `<h2>`
 * группы.
 */
function groupHeading(label: string): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: label });
}

function queryGroupHeading(label: string): HTMLElement | null {
  return screen.queryByRole('heading', { level: 2, name: label });
}

describe('Today (M06 Empty / M07 Normal)', () => {
  it('M06: без единой подходящей задачи показывает пустое состояние, а не пустые группы', async () => {
    renderToday([]);

    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());

    for (const key of [
      'groups.missedDeadline',
      'groups.missedPlan',
      'groups.focus',
      'groups.timed',
      'groups.today',
      'groups.later',
    ] as const) {
      expect(queryGroupHeading(t('today', key))).not.toBeInTheDocument();
    }
  });

  it('M07: шесть групп рендерятся в precedence-порядке §6, только непустые', async () => {
    const missedDeadline = makeTask({ title: 'Просроченный дедлайн', deadlineDate: YESTERDAY });
    const missedPlan = makeTask({ title: 'Забытый план', plannedDate: YESTERDAY });
    const focus = makeTask({ title: 'Главная задача', plannedDate: TODAY, focusDate: TODAY });
    const today = makeTask({ title: 'Обычная сегодняшняя', plannedDate: TODAY });
    const later = makeTask({
      title: 'Когда-нибудь сегодня',
      plannedDate: TODAY,
      dayBucket: 'later',
    });

    renderToday([missedDeadline, missedPlan, focus, today, later]);

    await waitFor(() => expect(screen.getByText('Просроченный дедлайн')).toBeInTheDocument());

    // "По времени" не заведена в этом наборе — её заголовок не должен рендериться.
    expect(queryGroupHeading(t('today', 'groups.timed'))).not.toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent);
    expect(headings).toEqual([
      t('today', 'groups.missedDeadline'),
      t('today', 'groups.missedPlan'),
      t('today', 'groups.focus'),
      t('today', 'groups.today'),
      t('today', 'groups.later'),
    ]);

    expect(
      within(
        groupHeading(t('today', 'groups.missedDeadline')).closest('section') as HTMLElement,
      ).getByText('Просроченный дедлайн'),
    ).toBeInTheDocument();
    expect(
      within(
        groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
      ).getByText('Забытый план'),
    ).toBeInTheDocument();
    expect(
      within(groupHeading(t('today', 'groups.focus')).closest('section') as HTMLElement).getByText(
        'Главная задача',
      ),
    ).toBeInTheDocument();
    expect(
      within(groupHeading(t('today', 'groups.today')).closest('section') as HTMLElement).getByText(
        'Обычная сегодняшняя',
      ),
    ).toBeInTheDocument();
    expect(
      within(groupHeading(t('today', 'groups.later')).closest('section') as HTMLElement).getByText(
        'Когда-нибудь сегодня',
      ),
    ).toBeInTheDocument();

    expect(screen.queryByText(t('common', 'today.doneAll'))).not.toBeInTheDocument();
  });

  it('заголовок экрана — сегодняшняя дата (не жёстко закодированная строка)', async () => {
    renderToday([]);
    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());
    // Заголовок — САМА ДАТА (макет `[R1][M][07]`), а не слово «Сегодня»:
    // проверяется через тот же `formatDate`, что и экран, иначе тест
    // превратился бы во вторую реализацию форматирования даты.
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(formatDate(Temporal.Now.plainDateISO(), { weekday: 'long' }));
  });

  it('задача, подходящая под индексы planned_date И focus_date разом, отрендерена ровно один раз — в высшей по прецедансу группе "Главное", не в "Сегодня"', async () => {
    const dual = makeTask({ title: 'Дважды кандидат', plannedDate: TODAY, focusDate: TODAY });

    renderToday([dual]);

    await waitFor(() => expect(screen.getAllByText('Дважды кандидат')).toHaveLength(1));
    expect(queryGroupHeading(t('today', 'groups.today'))).not.toBeInTheDocument();
    expect(
      within(groupHeading(t('today', 'groups.focus')).closest('section') as HTMLElement).getByText(
        'Дважды кандидат',
      ),
    ).toBeInTheDocument();
  });

  it('задача с plannedDate в будущем без дедлайна/фокуса не входит ни в одну группу Today', async () => {
    const future = makeTask({ title: 'Будущая задача', plannedDate: TOMORROW });
    renderToday([future]);
    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());
    expect(screen.queryByText('Будущая задача')).not.toBeInTheDocument();
  });
});

describe('Today — действия (Complete/Reschedule/Change deadline)', () => {
  it('чекбокс строки реально завершает задачу через completeTaskCommand — задача пропадает из списка', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Обычная сегодняшняя', plannedDate: TODAY });
    const getStorage = renderTodayCapturingStorage([task]);

    await waitFor(() => expect(screen.getByText('Обычная сегодняшняя')).toBeInTheDocument());

    await user.click(screen.getByRole('checkbox', { name: 'Обычная сегодняшняя' }));

    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());
    expect(screen.queryByText('Обычная сегодняшняя')).not.toBeInTheDocument();

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.completionKind).toBe('done');
  });

  it('меню «Не по плану» → «Сегодня» реально переносит plannedDate и задачу — в группу «Сегодня»', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Забытый план', plannedDate: YESTERDAY });
    const getStorage = renderTodayCapturingStorage([task]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
        ).getByText('Забытый план'),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: t('today', 'menu.triggerLabel', { title: 'Забытый план' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('today', 'actions.rescheduleToday') }));

    await waitFor(() =>
      expect(queryGroupHeading(t('today', 'groups.missedPlan'))).not.toBeInTheDocument(),
    );
    expect(
      within(groupHeading(t('today', 'groups.today')).closest('section') as HTMLElement).getByText(
        'Забытый план',
      ),
    ).toBeInTheDocument();

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.plannedDate).toEqual(TODAY);
  });

  it('меню «Не по плану» → «Завтра» переносит plannedDate на завтра — задача уходит с Today вовсе', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Забытый план 2', plannedDate: YESTERDAY });
    const getStorage = renderTodayCapturingStorage([task]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
        ).getByText('Забытый план 2'),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: t('today', 'menu.triggerLabel', { title: 'Забытый план 2' }),
      }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: t('today', 'actions.rescheduleTomorrow') }),
    );

    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());
    expect(screen.queryByText('Забытый план 2')).not.toBeInTheDocument();

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.plannedDate).toEqual(TOMORROW);
  });

  it('меню «Просрочен срок» → «Изменить срок» открывает DatePicker и реально меняет deadlineDate', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Просроченный дедлайн 2', deadlineDate: YESTERDAY });
    const getStorage = renderTodayCapturingStorage([task]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedDeadline')).closest('section') as HTMLElement,
        ).getByText('Просроченный дедлайн 2'),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: t('today', 'menu.triggerLabel', { title: 'Просроченный дедлайн 2' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('today', 'actions.changeDeadline') }));

    // Открывшийся `DatePicker` (внутри `Modal`) по умолчанию показывает
    // ТЕКУЩИЙ месяц (см. заголовок `Today.tsx`) — сегодняшняя ячейка всегда
    // в нём есть, `aria-current="date"` находит её без листания месяцев.
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);

    // Дедлайн больше не просрочен (`effectiveDeadlineDateTime` для
    // date-only дедлайна — конец суток) и задача без `plannedDate`/
    // `focusDate` не входит ни в одну группу Today — список пустеет.
    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());
    expect(screen.queryByText('Просроченный дедлайн 2')).not.toBeInTheDocument();

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.deadlineDate).toEqual(TODAY);
  });

  it('провалившаяся команда (`not_found`) показывает ошибку и не трогает список молча', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Удалённая где-то параллельно', plannedDate: TODAY });
    const getStorage = renderTodayCapturingStorage([task]);

    await waitFor(() =>
      expect(screen.getByText('Удалённая где-то параллельно')).toBeInTheDocument(),
    );

    // Симулирует конкурентную мутацию: задача tombstone'ится в хранилище
    // мимо экрана (другая вкладка/устройство) между рендером и кликом —
    // `completeTaskCommand` находит её удалённой и вернёт `not_found`, а
    // не тихо притворится успехом.
    await getStorage().runTransaction(async (tx) => {
      const current = await tx.tasks.findById(task.id);
      if (current === null) throw new Error('задача не найдена в тесте');
      await tx.applyMutation({
        writes: [{ entity: 'task', value: { ...current, deletedAt: Temporal.Now.instant() } }],
        outbox: [makeOutboxEntry('task', task.id)],
      });
    });

    await user.click(screen.getByRole('checkbox', { name: 'Удалённая где-то параллельно' }));

    await waitFor(() =>
      expect(screen.getByText(t('today', 'errors.actionFailed'))).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('Today — «Добавить в Главное» (M11 Focus)', () => {
  it('задача из группы «Сегодня» → «Добавить в Главное» сразу переходит в «Главное», без модалки', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Обычная сегодняшняя', plannedDate: TODAY });
    const getStorage = renderTodayCapturingStorage([task]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.today')).closest('section') as HTMLElement,
        ).getByText('Обычная сегодняшняя'),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: t('today', 'menu.triggerLabel', { title: 'Обычная сегодняшняя' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('today', 'actions.addToFocus') }));

    // Без модалки — переход сразу.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.focus')).closest('section') as HTMLElement,
        ).getByText('Обычная сегодняшняя'),
      ).toBeInTheDocument(),
    );
    expect(queryGroupHeading(t('today', 'groups.today'))).not.toBeInTheDocument();

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.focusDate).toEqual(TODAY);
    expect(stored?.dayBucket).toBe('default');
  });

  it('задача из «Не по плану» → «Добавить в Главное» показывает модалку подтверждения; после подтверждения переносит plannedDate и добавляет в Главное', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Забытый план 3', plannedDate: YESTERDAY });
    const getStorage = renderTodayCapturingStorage([task]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
        ).getByText('Забытый план 3'),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: t('today', 'menu.triggerLabel', { title: 'Забытый план 3' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('today', 'actions.addToFocus') }));

    const dialog = await screen.findByRole('dialog', {
      name: t('today', 'focusDialog.confirmTitle'),
    });
    expect(dialog).toBeInTheDocument();

    // Ещё не применилось — задача остаётся в «Не по плану» до подтверждения.
    expect(
      within(
        groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
      ).getByText('Забытый план 3'),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: t('today', 'focusDialog.confirm') }),
    );

    await waitFor(() =>
      expect(queryGroupHeading(t('today', 'groups.missedPlan'))).not.toBeInTheDocument(),
    );
    expect(
      within(groupHeading(t('today', 'groups.focus')).closest('section') as HTMLElement).getByText(
        'Забытый план 3',
      ),
    ).toBeInTheDocument();

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.plannedDate).toEqual(TODAY);
    expect(stored?.focusDate).toEqual(TODAY);
    expect(stored?.dayBucket).toBe('default');
  });

  it('три задачи уже в Главном — назначение четвёртой открывает выбор замены; после выбора замена снята, новая — в Главном', async () => {
    const user = userEvent.setup();
    const focus1 = makeTask({ title: 'Фокус 1', plannedDate: TODAY, focusDate: TODAY });
    const focus2 = makeTask({ title: 'Фокус 2', plannedDate: TODAY, focusDate: TODAY });
    const focus3 = makeTask({ title: 'Фокус 3', plannedDate: TODAY, focusDate: TODAY });
    const candidate = makeTask({ title: 'Четвёртый кандидат', plannedDate: TODAY });
    const getStorage = renderTodayCapturingStorage([focus1, focus2, focus3, candidate]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.focus')).closest('section') as HTMLElement,
        ).getByText('Фокус 1'),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: t('today', 'menu.triggerLabel', { title: 'Четвёртый кандидат' }),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: t('today', 'actions.addToFocus') }));

    const dialog = await screen.findByRole('dialog', {
      name: t('today', 'focusDialog.replaceTitle'),
    });
    expect(within(dialog).getByText('Фокус 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Фокус 2')).toBeInTheDocument();
    expect(within(dialog).getByText('Фокус 3')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Фокус 2' }));

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.focus')).closest('section') as HTMLElement,
        ).getByText('Четвёртый кандидат'),
      ).toBeInTheDocument(),
    );

    const focusSection = groupHeading(t('today', 'groups.focus')).closest('section') as HTMLElement;
    expect(within(focusSection).getByText('Фокус 1')).toBeInTheDocument();
    expect(within(focusSection).getByText('Фокус 3')).toBeInTheDocument();
    expect(within(focusSection).queryByText('Фокус 2')).not.toBeInTheDocument();
    // Ровно 3 задачи в Главном, не 4 — замена, не добавление сверх лимита.
    expect(within(focusSection).getAllByRole('checkbox')).toHaveLength(3);

    const replaced = await getStorage().tasks.findById(focus2.id);
    expect(replaced?.focusDate).toBeNull();
    const stored = await getStorage().tasks.findById(candidate.id);
    expect(stored?.focusDate).toEqual(TODAY);
  });
});

describe('Today — bulk Today/Tomorrow («Не по плану», M09)', () => {
  it('режим выбора распространяется на ВСЕ группы (M37): чекбокс выбирает, а не завершает', async () => {
    const user = userEvent.setup();
    const missedPlanTask = makeTask({ title: 'Забытая А', plannedDate: YESTERDAY });
    const todayTask = makeTask({ title: 'Обычная сегодняшняя Б', plannedDate: TODAY });
    const getStorage = renderTodayCapturingStorage([missedPlanTask, todayTask]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
        ).getByText('Забытая А'),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));

    // Чекбокс "Не по плану" в режиме выбора переключает выбор, не завершает задачу.
    await user.click(screen.getByRole('checkbox', { name: 'Забытая А' }));
    expect(screen.getByRole('checkbox', { name: 'Забытая А' })).toBeChecked();
    const missedPlanStored = await getStorage().tasks.findById(missedPlanTask.id);
    expect(missedPlanStored?.status).toBe('active');

    // И чекбокс ДРУГОЙ группы в этом режиме тоже выбирает, а не завершает:
    // `01§20` описывает действия над выбором, не над одной группой, а макет
    // `[R1][M][37]` подсвечивает строки вперемешку. Раньше режим был узким
    // (только «Не по плану», M09) — это состояние экрана и расширено.
    await user.click(screen.getByRole('checkbox', { name: 'Обычная сегодняшняя Б' }));
    expect(screen.getByRole('checkbox', { name: 'Обычная сегодняшняя Б' })).toBeChecked();
    expect(screen.getByText('Обычная сегодняшняя Б')).toBeInTheDocument();
    const todayStored = await getStorage().tasks.findById(todayTask.id);
    expect(todayStored?.status).toBe('active');

    // А вне режима — прежнее поведение: чекбокс завершает.
    await user.click(screen.getByRole('button', { name: t('today', 'selection.exit') }));
    await user.click(screen.getByRole('checkbox', { name: 'Обычная сегодняшняя Б' }));
    await waitFor(() =>
      expect(screen.queryByText('Обычная сегодняшняя Б')).not.toBeInTheDocument(),
    );
    expect((await getStorage().tasks.findById(todayTask.id))?.status).toBe('completed');
  });

  it('выбор 2 из 3 задач «Не по плану» → «Сегодня» переносит plannedDate только у выбранных, невыбранная остаётся на месте', async () => {
    const user = userEvent.setup();
    const taskA = makeTask({ title: 'Bulk А', plannedDate: YESTERDAY });
    const taskB = makeTask({ title: 'Bulk Б', plannedDate: YESTERDAY });
    const taskC = makeTask({ title: 'Bulk В', plannedDate: YESTERDAY });
    const getStorage = renderTodayCapturingStorage([taskA, taskB, taskC]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
        ).getByText('Bulk А'),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));
    await user.click(screen.getByRole('checkbox', { name: 'Bulk А' }));
    await user.click(screen.getByRole('checkbox', { name: 'Bulk Б' }));

    expect(screen.getByText(t('today', 'bulk.selectedCount', { count: 2 }))).toBeInTheDocument();

    // Дата в панели M37 — иконка, за ней диалог с быстрыми пунктами и
    // календарём (`01§20` «Move date»), поэтому шага теперь два.
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.date') }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.today') }));

    // Выбранные ушли из "Не по плану" в "Сегодня", невыбранная осталась в "Не по плану".
    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.today')).closest('section') as HTMLElement,
        ).getByText('Bulk А'),
      ).toBeInTheDocument(),
    );
    expect(
      within(groupHeading(t('today', 'groups.today')).closest('section') as HTMLElement).getByText(
        'Bulk Б',
      ),
    ).toBeInTheDocument();
    expect(
      within(
        groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
      ).getByText('Bulk В'),
    ).toBeInTheDocument();
    expect(
      within(
        groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
      ).queryByText('Bulk А'),
    ).not.toBeInTheDocument();

    // Режим выбора завершился — кнопка "Выбрать" снова доступна, панель массовых действий скрыта.
    expect(screen.getByRole('button', { name: t('today', 'selection.enter') })).toBeInTheDocument();
    expect(
      screen.queryByText(t('today', 'bulk.selectedCount', { count: 2 })),
    ).not.toBeInTheDocument();

    const storedA = await getStorage().tasks.findById(taskA.id);
    const storedB = await getStorage().tasks.findById(taskB.id);
    const storedC = await getStorage().tasks.findById(taskC.id);
    expect(storedA?.plannedDate).toEqual(TODAY);
    expect(storedB?.plannedDate).toEqual(TODAY);
    expect(storedC?.plannedDate).toEqual(YESTERDAY);
    // "Bulk never changes Deadline" — дедлайн не тронут ни у одной задачи.
    expect(storedA?.deadlineDate).toBeNull();
  });

  it('«Не по плану» → «Завтра» переносит выбранные задачи на завтра, задачи уходят с Today', async () => {
    const user = userEvent.setup();
    const taskA = makeTask({ title: 'Bulk-завтра А', plannedDate: YESTERDAY });
    const taskB = makeTask({ title: 'Bulk-завтра Б', plannedDate: YESTERDAY });
    const getStorage = renderTodayCapturingStorage([taskA, taskB]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
        ).getByText('Bulk-завтра А'),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));
    await user.click(screen.getByRole('checkbox', { name: 'Bulk-завтра А' }));
    await user.click(screen.getByRole('checkbox', { name: 'Bulk-завтра Б' }));
    // Дата в панели M37 — иконка, за ней диалог с быстрыми пунктами и
    // календарём (`01§20` «Move date»), поэтому шага теперь два.
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.date') }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.tomorrow') }));

    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());

    const storedA = await getStorage().tasks.findById(taskA.id);
    const storedB = await getStorage().tasks.findById(taskB.id);
    expect(storedA?.plannedDate).toEqual(TOMORROW);
    expect(storedB?.plannedDate).toEqual(TOMORROW);
  });

  it('повторный клик «Готово» выходит из режима выбора и сбрасывает выбор без применения действия', async () => {
    const user = userEvent.setup();
    const taskA = makeTask({ title: 'Отменённый выбор', plannedDate: YESTERDAY });
    const getStorage = renderTodayCapturingStorage([taskA]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
        ).getByText('Отменённый выбор'),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));
    await user.click(screen.getByRole('checkbox', { name: 'Отменённый выбор' }));
    expect(screen.getByRole('checkbox', { name: 'Отменённый выбор' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: t('today', 'selection.exit') }));

    expect(screen.getByRole('button', { name: t('today', 'selection.enter') })).toBeInTheDocument();
    // Задача не тронута — perенос не применялся, чекбокс снова невыбран (Complete-режим).
    const stored = await getStorage().tasks.findById(taskA.id);
    expect(stored?.plannedDate).toEqual(YESTERDAY);
    expect(screen.getByRole('checkbox', { name: 'Отменённый выбор' })).not.toBeChecked();
  });

  it('одна из N bulk-команд отклонена валидатором (нечитаемый заголовок) — Toast с ошибкой, список обновлён по факту частичного успеха', async () => {
    const user = userEvent.setup();
    // "..." — только пунктуация, `hasReadableContent` (правило 14) её отклоняет;
    // seedTasks пишет напрямую в storage, минуя валидатор, поэтому невалидная
    // задача спокойно попадает в список — и отклоняется только при попытке
    // `updateTaskCommand` её тронуть (правило 14 проверяет ВЕСЬ заголовок заново,
    // не только патч).
    const invalid = makeTask({ title: '...', plannedDate: YESTERDAY });
    const valid = makeTask({ title: 'Валидная задача', plannedDate: YESTERDAY });
    const getStorage = renderTodayCapturingStorage([invalid, valid]);

    await waitFor(() =>
      expect(
        within(
          groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
        ).getByText('...'),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));
    await user.click(screen.getByRole('checkbox', { name: '...' }));
    await user.click(screen.getByRole('checkbox', { name: 'Валидная задача' }));
    // Дата в панели M37 — иконка, за ней диалог с быстрыми пунктами и
    // календарём (`01§20` «Move date»), поэтому шага теперь два.
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.date') }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.today') }));

    await waitFor(() =>
      expect(screen.getByText(t('today', 'errors.bulkPartialFailure'))).toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Частичный успех виден по факту в списке: валидная ушла в "Сегодня",
    // невалидная осталась в "Не по плану" — не проглочено молча.
    expect(
      within(groupHeading(t('today', 'groups.today')).closest('section') as HTMLElement).getByText(
        'Валидная задача',
      ),
    ).toBeInTheDocument();
    expect(
      within(
        groupHeading(t('today', 'groups.missedPlan')).closest('section') as HTMLElement,
      ).getByText('...'),
    ).toBeInTheDocument();

    const storedInvalid = await getStorage().tasks.findById(invalid.id);
    const storedValid = await getStorage().tasks.findById(valid.id);
    expect(storedInvalid?.plannedDate).toEqual(YESTERDAY);
    expect(storedValid?.plannedDate).toEqual(TODAY);
  });
});

describe('Today — M08 свёртываемые группы', () => {
  it('группа с 21 задачей (>20) стартует свёрнутой — заголовок кликабелен и разворачивает список', async () => {
    const user = userEvent.setup();
    const tasks = Array.from({ length: 21 }, (_, index) =>
      makeTask({ title: `Задача ${String(index + 1)}`, plannedDate: TODAY }),
    );
    renderTodayCapturingStorage(tasks);

    const toggle = await screen.findByRole('button', { name: t('today', 'groups.today') });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Задача 1')).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Задача 1')).toBeInTheDocument();
    expect(screen.getByText('Задача 21')).toBeInTheDocument();
  });

  it('группа с 20 задачами (не больше порога) стартует развёрнутой', async () => {
    const tasks = Array.from({ length: 20 }, (_, index) =>
      makeTask({ title: `Ровно ${String(index + 1)}`, plannedDate: TODAY }),
    );
    renderTodayCapturingStorage(tasks);

    const toggle = await screen.findByRole('button', { name: t('today', 'groups.today') });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Ровно 1')).toBeInTheDocument();
  });
});

describe('Today — бейдж Входящих (вход в Inbox, см. заголовок файла)', () => {
  it('показывает счётчик активных inbox-задач рядом с заголовком', async () => {
    const inboxTasks = [
      makeTask({ title: 'Во входящих 1', captureState: 'inbox' }),
      makeTask({ title: 'Во входящих 2', captureState: 'inbox' }),
    ];
    renderTodayWithController(inboxTasks);

    expect(
      await screen.findByRole('button', { name: t('today', 'inboxBadge.label', { count: 2 }) }),
    ).toBeInTheDocument();
  });

  it('processed-задачи не считаются в бейдже, только capture_state=inbox', async () => {
    const tasks = [
      makeTask({ title: 'Обычная', plannedDate: TODAY }),
      makeTask({ title: 'Во входящих', captureState: 'inbox' }),
    ];
    renderTodayWithController(tasks);

    await waitFor(() => expect(screen.getByText('Обычная')).toBeInTheDocument());
    expect(
      screen.getByRole('button', { name: t('today', 'inboxBadge.label', { count: 1 }) }),
    ).toBeInTheDocument();
  });

  it('бейдж скрыт (не показывает «0»), когда Входящие пусты', async () => {
    renderTodayWithController([]);
    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    for (const count of [0, 1, 2, 3]) {
      expect(
        screen.queryByRole('button', { name: t('today', 'inboxBadge.label', { count }) }),
      ).not.toBeInTheDocument();
    }
  });

  it('клик по бейджу переводит на экран Входящие', async () => {
    const user = userEvent.setup();
    const inboxTask = makeTask({ title: 'Во входящих', captureState: 'inbox' });
    const { controller } = renderTodayWithController([inboxTask]);

    const badge = await screen.findByRole('button', {
      name: t('today', 'inboxBadge.label', { count: 1 }),
    });
    await user.click(badge);

    expect(controller.getState().screen).toBe('inbox');
  });
});

describe('Today — клик по строке открывает Task Detail (E10.2)', () => {
  it('клик по заголовку задачи открывает taskDetail с selectedTaskId/returnScreen=todayEmpty', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Открыть детали', plannedDate: TODAY });
    const { controller } = renderTodayWithController([task]);

    await waitFor(() => expect(screen.getByText('Открыть детали')).toBeInTheDocument());
    await user.click(screen.getByText('Открыть детали'));

    expect(controller.getState()).toEqual(
      expect.objectContaining({
        screen: 'taskDetail',
        selectedTaskId: task.id,
        returnScreen: 'todayEmpty',
      }),
    );
  });

  it('адверсариальная проверка: клик по чекбоксу строки завершает задачу, но НЕ открывает Task Detail', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Не открывать по чекбоксу', plannedDate: TODAY });
    const { controller, getStorage } = renderTodayWithController([task]);

    await waitFor(() => expect(screen.getByText('Не открывать по чекбоксу')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Не открывать по чекбоксу' }));

    // Эффект чекбокса реально произошёл (иначе тест ничего не доказывал бы —
    // мог бы «пройти» и от полностью нерабочего чекбокса).
    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.status).toBe('completed');
    });
    // ...и при этом экран НЕ переключился на taskDetail.
    expect(controller.getState().screen).not.toBe('taskDetail');
    expect(controller.getState().selectedTaskId).toBeNull();
  });

  it('адверсариальная проверка: клик по кнопке меню строки открывает меню, но НЕ открывает Task Detail', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Меню не открывает деталь', plannedDate: TODAY });
    const { controller } = renderTodayWithController([task]);

    await waitFor(() => expect(screen.getByText('Меню не открывает деталь')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('today', 'menu.triggerLabel', { title: 'Меню не открывает деталь' }),
      }),
    );

    // Меню реально открылось (иначе тест ничего не доказывал бы).
    expect(
      screen.getByRole('menuitem', { name: t('today', 'actions.complete') }),
    ).toBeInTheDocument();
    // ...и при этом экран НЕ переключился на taskDetail.
    expect(controller.getState().screen).not.toBe('taskDetail');
    expect(controller.getState().selectedTaskId).toBeNull();
  });
});

describe('Today — закрытие Quick Add обновляет список', () => {
  it('задача, созданная в оверлее, появляется на Today сразу после его закрытия', async () => {
    const { getStorage, controller } = renderTodayWithController([]);
    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());

    // Открыт оверлей; пока он открыт, задача заводится «снаружи» — ровно то,
    // что делает настоящий Quick Add, у которого своё состояние и свой
    // командный слой, а Today под ним даже не перемонтируется.
    controller.openQuickAdd('today');
    const storage = getStorage();
    const created = makeTask({ title: 'Заведено в оверлее', plannedDate: TODAY });
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'task', value: created }],
        outbox: [makeOutboxEntry('task', created.id)],
      });
    });

    // До закрытия экран под низом ничего не знает — и не обязан.
    expect(screen.queryByText('Заведено в оверлее')).not.toBeInTheDocument();

    controller.closeQuickAdd();

    // А вот после закрытия обязан: без этого человек нажимает «+», заводит
    // задачу и не видит её на экране — поломка, которую видно с первой
    // минуты пользования.
    expect(await screen.findByText('Заведено в оверлее')).toBeInTheDocument();
  });
});

/* Кнопки «Быстрое добавление» на самом экране Today больше нет — в макете
 * (`[R1][M][07]`) её нет, добавление живёт в центральной кнопке нижней
 * навигации. Проверка того, что оттуда задача заводится ИМЕННО на сегодня
 * (`01§3` «Origin → Inherited values»), переехала вместе с поведением в
 * `test/shell/AppShell.test.tsx` — не исчезла. */

describe('Today — вход в Settings (M41, значок-шестерёнка)', () => {
  it('клик по значку-шестерёнке ведёт на settings с settingsReturnScreen=todayEmpty', async () => {
    const user = userEvent.setup();
    const { controller } = renderTodayWithController([]);

    await user.click(
      await screen.findByRole('button', { name: t('today', 'settingsButton.label') }),
    );

    expect(controller.getState().screen).toBe('settings');
    expect(controller.getState().settingsReturnScreen).toBe('todayEmpty');
  });
});

describe('Today — повторы (E11.2)', () => {
  it('чекбокс recurring-задачи вызывает completeOccurrenceCommand и генерирует следующий occurrence', async () => {
    const user = userEvent.setup();
    const series = seedRecurrenceSeries();
    const task = makeTask({
      title: 'Полить цветы',
      plannedDate: TODAY,
      seriesId: series.id,
      occurrenceSeq: 1n,
    });
    const getStorage = renderTodayCapturingStorageWithSeries([task], [series]);

    await waitFor(() => expect(screen.getByText('Полить цветы')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Полить цветы' }));

    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.completionKind).toBe('done');

    // Серия unit:'day', interval:1, anchorType:'scheduled' — следующий слот
    // строго после сегодняшней локальной даты завершения (`01§11.3`).
    const nextOccurrences = await getStorage().tasks.listBySeries(series.id, 'active');
    expect(nextOccurrences).toHaveLength(1);
    expect(nextOccurrences[0]?.plannedDate?.toString()).toBe(TODAY.add({ days: 1 }).toString());
    expect(nextOccurrences[0]?.occurrenceSeq).toBe(2n);

    const updatedSeries = await getStorage().recurrenceSeries.findById(series.id);
    expect(updatedSeries?.nextOccurrenceSeq).toBe(3n);
  });

  it('чекбокс НЕ-recurring задачи по-прежнему завершает её как раньше (регрессия)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Обычная без повтора', plannedDate: TODAY });
    const getStorage = renderTodayCapturingStorageWithSeries([task], []);

    await waitFor(() => expect(screen.getByText('Обычная без повтора')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Обычная без повтора' }));

    await waitFor(() => expect(screen.getByText(t('common', 'today.doneAll'))).toBeInTheDocument());

    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.completionKind).toBe('done');
    expect(stored?.seriesId).toBeNull();
  });
});

describe('Today — M37 «Множественный выбор»: агрегированные подтверждения', () => {
  it('родитель и его подзадача выбраны ОБА — подтверждение показывается и не врёт про «0 подзадач»', async () => {
    // Регрессия живого прогона M37: первая версия триггерила подтверждение
    // по `additionalChildCount > 0`, и этот выбор завершал иерархию МОЛЧА,
    // хотя `01§20` требует подтверждения при самом наличии иерархии.
    const user = userEvent.setup();
    const parent = makeTask({ title: 'Родитель М37', plannedDate: TODAY });
    const child = makeTask({
      title: 'Подзадача М37',
      plannedDate: TODAY,
      parentTaskId: parent.id,
    });
    const getStorage = renderTodayCapturingStorage([parent, child]);

    await waitFor(() => expect(screen.getByText('Родитель М37')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));
    await user.click(screen.getByRole('checkbox', { name: 'Родитель М37' }));
    await user.click(screen.getByRole('checkbox', { name: 'Подзадача М37' }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.complete') }));

    expect(await screen.findByText(t('today', 'bulk.confirmTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('today', 'bulk.confirmBodyNoExtra'))).toBeInTheDocument();
    // Ни одна задача ещё не тронута — «Cancel leaves the entire selection
    // unchanged» достижимо только если до подтверждения записи не было.
    expect((await getStorage().tasks.findById(parent.id))?.status).toBe('active');

    await user.click(screen.getByRole('button', { name: t('today', 'bulk.confirmCancel') }));
    expect((await getStorage().tasks.findById(parent.id))?.status).toBe('active');
    expect((await getStorage().tasks.findById(child.id))?.status).toBe('active');
    // Выбор пережил отмену — человек может продолжить с того же места.
    expect(screen.getByText(t('today', 'bulk.selectedCount', { count: 2 }))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('today', 'bulk.complete') }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.confirmAccept') }));

    await waitFor(async () =>
      expect((await getStorage().tasks.findById(parent.id))?.status).toBe('completed'),
    );
    expect((await getStorage().tasks.findById(child.id))?.status).toBe('completed');
  });

  it('массовое удаление спрашивает подтверждение, отмена не удаляет ничего', async () => {
    // Undo (`01§9`) в R1 ещё нет, поэтому единственная страховка от
    // необратимого каскада — этот диалог. Тест краснеет, если его убрать.
    const user = userEvent.setup();
    const first = makeTask({ title: 'Удаляемая А', plannedDate: TODAY });
    const second = makeTask({ title: 'Удаляемая Б', plannedDate: TODAY });
    const getStorage = renderTodayCapturingStorage([first, second]);

    await waitFor(() => expect(screen.getByText('Удаляемая А')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));
    await user.click(screen.getByRole('checkbox', { name: 'Удаляемая А' }));
    await user.click(screen.getByRole('checkbox', { name: 'Удаляемая Б' }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.delete') }));

    expect(await screen.findByText(t('today', 'bulk.deleteConfirmTitle'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.confirmCancel') }));

    expect((await getStorage().tasks.findById(first.id))?.deletedAt).toBeNull();
    expect((await getStorage().tasks.findById(second.id))?.deletedAt).toBeNull();

    await user.click(screen.getByRole('button', { name: t('today', 'bulk.delete') }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.deleteConfirmAccept') }));

    await waitFor(async () =>
      expect((await getStorage().tasks.findById(first.id))?.deletedAt).not.toBeNull(),
    );
    expect((await getStorage().tasks.findById(second.id))?.deletedAt).not.toBeNull();
  });

  it('массовое удаление с активным напоминанием отменяет его в scheduler (00§7 шаг 5, Task A4)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Удаляемая с напоминанием', plannedDate: TODAY });
    const reminder = makeExplicitReminder(task.id);
    // Уже «запланировано» до монтирования (см. `fakeScheduler`) — тест
    // проверяет именно `cancel`, не побочный `schedule`.
    const scheduler = fakeScheduler([reminder.id]);
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const getStorage = renderTodayCapturingStorage([task], host);

    await waitFor(() => expect(screen.getByText('Удаляемая с напоминанием')).toBeInTheDocument());
    await seedReminder(getStorage(), reminder);
    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));
    await user.click(screen.getByRole('checkbox', { name: 'Удаляемая с напоминанием' }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.delete') }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.deleteConfirmAccept') }));

    await waitFor(() => expect(scheduler.calls.cancelled).toEqual([reminder.id]));
  });

  it('массовый приоритет применяется ко всем выбранным и только к ним', async () => {
    const user = userEvent.setup();
    const chosen = makeTask({ title: 'Приоритет А', plannedDate: TODAY });
    const untouched = makeTask({ title: 'Приоритет Б', plannedDate: TODAY });
    const getStorage = renderTodayCapturingStorage([chosen, untouched]);

    await waitFor(() => expect(screen.getByText('Приоритет А')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: t('today', 'selection.enter') }));
    await user.click(screen.getByRole('checkbox', { name: 'Приоритет А' }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.priority') }));
    await user.click(screen.getByRole('button', { name: t('today', 'bulk.priorityP1') }));

    await waitFor(async () =>
      expect((await getStorage().tasks.findById(chosen.id))?.priority).toBe(1),
    );
    expect((await getStorage().tasks.findById(untouched.id))?.priority).toBe(4);
  });
});
