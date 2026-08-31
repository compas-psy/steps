import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { makeOutboxEntry, makeTask } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { Task } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Today } from '../../src/screens/Today.js';

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

function renderTodayCapturingStorage(tasks: readonly Task[]): () => StoragePort {
  const controller = createAppController({ screen: 'todayEmpty' });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenTodayCapturing tasks={tasks} onStorage={(storage) => (capturedStorage = storage)} />
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
    expect(screen.getByText(t('today', 'pageTitle'))).toBeInTheDocument();
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
