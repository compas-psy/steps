import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor, within } from '@testing-library/react';
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
