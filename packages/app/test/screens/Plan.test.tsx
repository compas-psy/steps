import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { makeOutboxEntry, makeTask } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { Task } from '@shagi/core';
import { describe, expect, it, vi } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { Plan } from '../../src/screens/Plan.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

/** Тот же приём посева, что `Today.test.tsx` (см. её заголовок): пишет
 * задачи через `storage.runTransaction`/`applyMutation`, монтирует `Plan`
 * только ПОСЛЕ завершения посева — оба на одном и том же `StoragePort`. */
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

function SeedThenPlan({
  tasks,
  onStorage,
}: {
  tasks: readonly Task[];
  onStorage?: (storage: StoragePort) => void;
}): ReactElement | null {
  const storage = useStorage();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onStorage?.(storage);
    void seedTasks(storage, tasks).then(() => {
      if (!cancelled) setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tasks` фиксирован на монтирование теста
  }, [storage]);

  return seeded ? <Plan /> : null;
}

function renderPlan(tasks: readonly Task[] = []): {
  controller: ReturnType<typeof createAppController>;
  getStorage: () => StoragePort;
} {
  const controller = createAppController({ screen: 'plan' });
  let captured: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <SeedThenPlan tasks={tasks} onStorage={(storage) => (captured = storage)} />
    </AppProvider>,
  );
  return {
    controller,
    getStorage: () => {
      if (captured === undefined) throw new Error('storage не захвачен');
      return captured;
    },
  };
}

const NOW = Temporal.Now.plainDateTimeISO();
const TODAY = NOW.toPlainDate();
const YESTERDAY = TODAY.subtract({ days: 1 });
const TOMORROW = TODAY.add({ days: 1 });
const IN_TWO_DAYS = TODAY.add({ days: 2 });

/** Ждёт, пока асинхронная загрузка `storage.tasks.listByStatusAndPlannedDate`
 * внутри `Plan` разрешится — заголовок страницы (`<h1>`) рендерится сразу,
 * ещё до ответа хранилища, поэтому его одного недостаточно как сигнала
 * готовности (тот же класс гонки, что у `searchInput()` в `Search.test.tsx`,
 * см. её комментарий). Готово — как только на экране появился ЛИБО хотя бы
 * один заголовок дня (`<h2>`), ЛИБО calm empty state: после разрешения
 * промиса экран всегда в одном из этих двух состояний. */
async function waitForPageReady(): Promise<void> {
  await waitFor(() => {
    const hasDayHeadings = screen.queryAllByRole('heading', { level: 2 }).length > 0;
    const hasEmptyState = screen.queryByText(t('plan', 'empty.title')) !== null;
    expect(hasDayHeadings || hasEmptyState).toBe(true);
  });
}

function dayHeading(date: Temporal.PlainDate): HTMLElement {
  return screen.getByRole('heading', {
    level: 2,
    name: (name) => name.includes(String(date.day)),
  });
}

describe('Plan (M14 Agenda / M15 selected) — группировка по plannedDate, хронологический порядок', () => {
  it('группирует задачи по дню, дни рендерятся в хронологическом порядке', async () => {
    const onSecond = makeTask({ title: 'Второй день', plannedDate: IN_TWO_DAYS });
    const onFirst = makeTask({ title: 'Первый день', plannedDate: TOMORROW });
    // Порядок посева — намеренно не хронологический.
    renderPlan([onSecond, onFirst]);

    await waitForPageReady();

    const headings = screen.getAllByRole('heading', { level: 2 });
    const firstIndex = headings.findIndex((h) => h.textContent?.includes(String(TOMORROW.day)));
    const secondIndex = headings.findIndex((h) => h.textContent?.includes(String(IN_TWO_DAYS.day)));
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(screen.getByText('Первый день')).toBeInTheDocument();
    expect(screen.getByText('Второй день')).toBeInTheDocument();
  });

  it('задача без plannedDate не появляется в Plan вовсе, даже если есть дедлайн (01§14, дословно)', async () => {
    const deadlineOnly = makeTask({ title: 'Только дедлайн', deadlineDate: TOMORROW });
    renderPlan([deadlineOnly]);

    await waitForPageReady();

    expect(screen.queryByText('Только дедлайн')).not.toBeInTheDocument();
    expect(screen.getByText(t('plan', 'empty.title'))).toBeInTheDocument();
  });

  it('задача, запланированная на прошедший день, не появляется — Plan смотрит только вперёд', async () => {
    const past = makeTask({ title: 'Просроченный план', plannedDate: YESTERDAY });
    renderPlan([past]);

    await waitForPageReady();

    expect(screen.queryByText('Просроченный план')).not.toBeInTheDocument();
  });

  it('задача, запланированная на сегодня, ВКЛЮЧЕНА (сегодня входит в границу будущего)', async () => {
    const today = makeTask({ title: 'Сегодняшняя', plannedDate: TODAY });
    renderPlan([today]);

    await waitForPageReady();

    expect(screen.getByText('Сегодняшняя')).toBeInTheDocument();
  });
});

describe('Plan — маркер Available From', () => {
  it('маркер «Станет доступна» показан на своём дне, отдельно от задач, и не считается в их числе', async () => {
    const marker = makeTask({ title: 'Задача-источник маркера', availableFrom: IN_TWO_DAYS });
    const planned = makeTask({ title: 'Обычная задача дня', plannedDate: IN_TWO_DAYS });
    renderPlan([marker, planned]);

    await waitForPageReady();

    expect(screen.getByText(t('plan', 'availableFromMarker.label'))).toBeInTheDocument();
    // Сама задача-источник маркера НЕ становится строкой (нет plannedDate).
    expect(screen.queryByText('Задача-источник маркера')).not.toBeInTheDocument();
    // Единственная строка задачи в этом дне — обычная запланированная.
    const heading = dayHeading(IN_TWO_DAYS);
    const section = heading.closest('section');
    expect(section).not.toBeNull();
    expect(section?.querySelectorAll('.shagi-task-row')).toHaveLength(1);
  });
});

describe('Plan — чекбокс завершает задачу (живое действие, не украшение)', () => {
  it('клик по чекбоксу завершает задачу и убирает её из повестки', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Встреча с поставщиком', plannedDate: TOMORROW });
    const { getStorage } = renderPlan([task]);
    await waitForPageReady();
    expect(screen.getByText('Встреча с поставщиком')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Встреча с поставщиком' }));

    // Проверяется И запись в хранилище, И исчезновение со экрана: раньше
    // чекбокс тут рендерился `disabled` — выглядел рабочим и не делал
    // ничего. Тест обязан покраснеть, если это вернётся.
    await waitFor(() =>
      expect(screen.queryByText('Встреча с поставщиком')).not.toBeInTheDocument(),
    );
    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.status).toBe('completed');
  });

  it('чекбокс не отключён — по нему можно нажать', async () => {
    renderPlan([makeTask({ title: 'Активная задача', plannedDate: TOMORROW })]);
    await waitForPageReady();

    expect(screen.getByRole('checkbox', { name: 'Активная задача' })).toBeEnabled();
  });
});

describe('Plan — переходы', () => {
  it('клик по задаче открывает Task Detail (controller.openTask)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Открываемая задача', plannedDate: TOMORROW });
    const { controller } = renderPlan([task]);

    await waitForPageReady();
    await user.click(screen.getByText('Открываемая задача'));

    expect(controller.getState()).toEqual(
      expect.objectContaining({
        screen: 'taskDetail',
        selectedTaskId: task.id,
        returnScreen: 'plan',
      }),
    );
  });

  it('клик по дате в полосе прокручивает к группе этого дня', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача через два дня', plannedDate: IN_TWO_DAYS });
    renderPlan([task]);

    await waitForPageReady();
    const scrollSpy = vi.fn();
    const heading = dayHeading(IN_TWO_DAYS);
    const section = heading.closest('section');
    expect(section).not.toBeNull();
    section!.scrollIntoView = scrollSpy;

    const stripButton = screen.getByRole('radio', { name: new RegExp(String(IN_TWO_DAYS.day)) });
    await user.click(stripButton);

    expect(scrollSpy).toHaveBeenCalled();
  });
});

describe('Plan — «Показать ещё»', () => {
  it('изначально видно ограниченное число дней-групп, «Показать ещё» догружает следующие', async () => {
    const user = userEvent.setup();
    // 16 дней подряд с задачей — больше начального окна (14), чтобы кнопка
    // была видна, и чтобы догрузка реально открыла ещё один день.
    const tasks = Array.from({ length: 16 }, (_, index) =>
      makeTask({ title: `День ${index}`, plannedDate: TODAY.add({ days: index }) }),
    );
    renderPlan(tasks);

    await waitForPageReady();

    expect(screen.queryByText('День 15')).not.toBeInTheDocument();
    const loadMoreButton = screen.getByRole('button', { name: t('plan', 'loadMore.button') });

    await user.click(loadMoreButton);

    expect(screen.getByText('День 15')).toBeInTheDocument();
  });
});

describe('Plan — пустое состояние', () => {
  it('без единой будущей запланированной задачи показывает calm empty state', async () => {
    renderPlan([]);

    await waitForPageReady();

    expect(screen.getByText(t('plan', 'empty.title'))).toBeInTheDocument();
    expect(screen.getByText(t('plan', 'empty.description'))).toBeInTheDocument();
  });
});
