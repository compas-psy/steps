import { useEffect, useState, type ReactElement } from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import {
  createUnavailablePlatform,
  type NotificationPrecision,
  type NotificationSchedulerPort,
  type ScheduledNotificationSnapshot,
} from '@shagi/platform';
import { formatDate, t } from '@shagi/i18n';
import {
  makeChecklistItem,
  makeExplicitReminder,
  makeLabel,
  makeOutboxEntry,
  makeProject,
  makeSection,
  makeTask,
  makeTaskLabel,
} from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type {
  ChecklistItem,
  Label,
  Project,
  RecurrenceSeries,
  Section,
  Task,
  Uuid,
} from '@shagi/core';
import {
  createExplicitReminderCommand,
  generateUuidV7,
  isTaskLabelActive,
  makeDurationMinutes,
  makeOccurrenceSeq,
} from '@shagi/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController, type ScreenId } from '../../src/state/store.js';
import { TaskDetail } from '../../src/screens/TaskDetail.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

/** Тот же фейк, что `test/state/reminder-reconciliation.test.ts` (Task A3)
 * и `test/App.test.tsx` (Task A4) — платформа целиком в памяти.
 * `initialScheduled` — id, уже «запланированные» до монтирования экрана
 * (имитирует прошлый успешный проход реконсиляции): нужен тестам
 * complete/delete subtask ниже, которым важно НАЧАТЬ с уже-запланированным
 * напоминанием, чтобы проверить именно `scheduler.cancel`, а не
 * `scheduler.schedule` (idempotency-путь Task A3 не трогает уже
 * запланированный id). */
/** `capability` (Task B6, ST10) — по умолчанию `'exact'`, тот же честный
 * ответ, что и раньше для всех уже существующих тестов этого файла; тесты
 * disclosure ниже передают `'inexact'`, чтобы проверить именно реакцию
 * экрана на пониженную точность, а не поведение самого фейка. */
function fakeScheduler(
  initialScheduled: readonly string[] = [],
  capability: NotificationPrecision = 'exact',
): NotificationSchedulerPort & {
  calls: { scheduled: string[]; cancelled: string[] };
} {
  const scheduled = new Map<string, ScheduledNotificationSnapshot>(
    initialScheduled.map((id) => [
      id,
      // Плейсхолдер (Task A6): тесты, что сеют этим массивом, всегда делают
      // задачу неактивной ДО проверки — сработавшая ветка реконсиляции
      // здесь всегда `cancel` (сравнение только по присутствию id в
      // desired, содержимое не участвует), поэтому title/scheduledAt
      // плейсхолдера не влияют на исход ни одного теста этого файла.
      { reminderId: id, title: '', scheduledAt: Temporal.Instant.fromEpochMilliseconds(0) },
    ]),
  );
  const calls = { scheduled: [] as string[], cancelled: [] as string[] };
  return {
    calls,
    async schedule(id, title, date, time, timezone, precision) {
      const target =
        time === null
          ? date.toZonedDateTime(timezone)
          : date.toZonedDateTime({ timeZone: timezone, plainTime: time });
      const snapshot: ScheduledNotificationSnapshot =
        precision === undefined
          ? { reminderId: id, title, scheduledAt: target.toInstant() }
          : { reminderId: id, title, scheduledAt: target.toInstant(), precision };
      scheduled.set(id, snapshot);
      calls.scheduled.push(id);
    },
    async cancel(id) {
      scheduled.delete(id);
      calls.cancelled.push(id);
    },
    async listScheduled() {
      return Array.from(scheduled.values());
    },
    async getSchedulingCapability(): Promise<NotificationPrecision> {
      return capability;
    },
  };
}

interface Seed {
  readonly projects?: readonly Project[];
  readonly sections?: readonly Section[];
  readonly tasks?: readonly Task[];
  readonly checklistItems?: readonly ChecklistItem[];
  readonly labels?: readonly Label[];
  readonly taskLabels?: readonly ReturnType<typeof makeTaskLabel>[];
  readonly recurrenceSeries?: readonly RecurrenceSeries[];
}

async function seed(storage: StoragePort, entities: Seed): Promise<void> {
  // Серии — ДО задач (см. `ProjectDetail.test.tsx` за тем же обоснованием
  // порядка: тот же, что `createRecurringTaskCommand` использует в проде).
  for (const series of entities.recurrenceSeries ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'recurrence_series', value: series }],
        outbox: [makeOutboxEntry('recurrence_series', series.id)],
      });
    });
  }
  for (const project of entities.projects ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'project', value: project }],
        outbox: [makeOutboxEntry('project', project.id)],
      });
    });
  }
  for (const section of entities.sections ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'section', value: section }],
        outbox: [makeOutboxEntry('section', section.id)],
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
  for (const label of entities.labels ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'label', value: label }],
        outbox: [makeOutboxEntry('label', label.id)],
      });
    });
  }
  for (const item of entities.checklistItems ?? []) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'checklist_item', value: item }],
        outbox: [makeOutboxEntry('checklist_item', item.id)],
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

/** Отдельно от `seed()`/`Seed` (реминдеры нужны только новым тестам
 * реконсиляции ниже, не всему файлу) — пишет напоминание НАПРЯМУЮ в
 * хранилище, минуя `createExplicitReminderCommand` (тестам реконсиляции
 * не важен путь создания, важно только что реминдер уже есть и `enabled`
 * ДО действия, которое должно его отменить). */
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

/** См. `Today.test.tsx`/`ProjectDetail.test.tsx` за тем же обоснованием
 * узкой фикстуры-дублёра `RecurrenceSeries`. */
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

/** Тот же приём, что `ProjectDetail.test.tsx` — сеет и монтирует
 * `TaskDetail` только после завершения посева, на одном и том же инстансе
 * `StoragePort`, который получает сам экран, и захватывает его наружу. */
function SeedThenTaskDetailCapturing({
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

  return seeded ? <TaskDetail /> : null;
}

function renderTaskDetail(
  taskId: Uuid,
  entities: Seed,
  fromScreen: ScreenId = 'todayEmpty',
  host: AppHost = testHost(),
): { getStorage: () => StoragePort; controller: ReturnType<typeof createAppController> } {
  const controller = createAppController({
    screen: 'taskDetail',
    selectedTaskId: taskId,
    returnScreen: fromScreen,
  });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={host} controller={controller}>
      <SeedThenTaskDetailCapturing
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

describe('TaskDetail — breadcrumb (проект/раздел или «Входящие»)', () => {
  it('без проекта показывает «Входящие»', async () => {
    const task = makeTask({ title: 'Без проекта' });
    renderTaskDetail(task.id, { tasks: [task] });

    await waitFor(() =>
      expect(screen.getByText(t('taskDetail', 'breadcrumb.inbox'))).toBeInTheDocument(),
    );
  });

  it('с проектом и разделом показывает «Проект › Раздел»', async () => {
    const project = makeProject({ title: 'Ремонт' });
    const section = makeSection(project.id);
    const task = makeTask({ title: 'С проектом', projectId: project.id, sectionId: section.id });
    renderTaskDetail(task.id, { projects: [project], sections: [section], tasks: [task] });

    await waitFor(() =>
      expect(screen.getByText('Ремонт › Проверочная секция')).toBeInTheDocument(),
    );
  });
});

describe('TaskDetail — заголовок/контекст', () => {
  it('title/description — автосохранение по blur', async () => {
    const task = makeTask({ title: 'Старое название' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const titleInput = await screen.findByLabelText(t('taskDetail', 'title.label'));
    fireEvent.change(titleInput, { target: { value: 'Новое название' } });
    fireEvent.blur(titleInput);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.title).toBe('Новое название');
    });

    const descriptionInput = screen.getByLabelText(t('taskDetail', 'description.label'));
    fireEvent.change(descriptionInput, { target: { value: 'Подробности' } });
    fireEvent.blur(descriptionInput);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.description).toBe('Подробности');
    });
  });

  it('Enter в поле названия применяет правку, а не только blur', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Старое название' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const titleInput = await screen.findByLabelText(t('taskDetail', 'title.label'));
    fireEvent.change(titleInput, { target: { value: 'Название по Enter' } });
    await user.type(titleInput, '{Enter}');

    // Enter — самый очевидный жест «готово» в однострочном поле. Раньше он
    // не делал ничего: сохранение висело только на blur.
    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.title).toBe('Название по Enter');
    });
  });

  it('«Готово» не уходит с экрана, пока правка не записана', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Старое название' });
    const { getStorage, controller } = renderTaskDetail(task.id, { tasks: [task] });

    const titleInput = await screen.findByLabelText(t('taskDetail', 'title.label'));
    fireEvent.change(titleInput, { target: { value: 'Название перед закрытием' } });
    await user.click(screen.getByRole('button', { name: t('taskDetail', 'back.label') }));

    // Гонка, найденная живым прогоном: клик по «Готово» вызывает blur и
    // закрытие практически одновременно, и экран, на который мы
    // возвращаемся, успевал прочитать хранилище ДО записи — на Today
    // оставалось старое название. К моменту, когда экран действительно
    // сменился, запись обязана быть завершена.
    await waitFor(() => expect(controller.getState().screen).toBe('todayEmpty'));
    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.title).toBe('Название перед закрытием');
  });

  it('чекбокс завершения вызывает completeTaskCommand', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Завершить меня' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const checkbox = await screen.findByRole('checkbox', {
      name: t('taskDetail', 'completeCheckbox.label', { title: 'Завершить меня' }),
    });
    await user.click(checkbox);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.status).toBe('completed');
    });
  });

  it('«Готово» возвращает на returnScreen=todayEmpty', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Из Today' });
    const { controller } = renderTaskDetail(task.id, { tasks: [task] }, 'todayEmpty');

    await screen.findByLabelText(t('taskDetail', 'title.label'));
    await user.click(screen.getByRole('button', { name: t('taskDetail', 'back.label') }));

    expect(controller.getState()).toEqual(
      expect.objectContaining({ screen: 'todayEmpty', selectedTaskId: null, returnScreen: null }),
    );
  });

  it('«Готово» возвращает на returnScreen=inbox', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Из Inbox' });
    const { controller } = renderTaskDetail(task.id, { tasks: [task] }, 'inbox');

    await screen.findByLabelText(t('taskDetail', 'title.label'));
    await user.click(screen.getByRole('button', { name: t('taskDetail', 'back.label') }));

    expect(controller.getState().screen).toBe('inbox');
  });
});

describe('TaskDetail — Planning: Available From/Planned/Deadline (E08.2, редактор дат)', () => {
  it('Available From — выбор в picker сохраняет availableFrom через updateTaskCommand', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Без доступности' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.availableFrom.set') }),
    );
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.availableFrom?.equals(Temporal.Now.plainDateISO())).toBe(true);
    });
    // Модалка Available From закрывается сама после выбора (одно значение,
    // тот же приём, что picker'ы проекта/раздела/приоритета этого экрана).
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('Available From — «Очистить» снимает availableFrom', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'С доступностью' });
    const withAvailableFrom: Task = { ...task, availableFrom: Temporal.Now.plainDateISO() };
    const { getStorage } = renderTaskDetail(task.id, { tasks: [withAvailableFrom] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.availableFrom.clear') }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.availableFrom).toBeNull();
    });
  });

  it('Planned Date — шорткат «Сегодня» ставит дату, время появляется только после этого', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Без плана' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.planned.set') }),
    );
    // До выбора даты TimePicker ещё не смонтирован — тот же порядок, что
    // требует домен (правило 1: `plannedTime` без `plannedDate` блокирующее).
    expect(
      screen.queryByRole('listbox', { name: t('taskDetail', 'planning.planned.hourListLabel') }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.shortcuts.today') }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.plannedDate?.equals(Temporal.Now.plainDateISO())).toBe(true);
    });
    // После сохранения даты модалка остаётся открытой — время теперь доступно.
    await waitFor(() =>
      expect(
        screen.getByRole('listbox', { name: t('taskDetail', 'planning.planned.hourListLabel') }),
      ).toBeInTheDocument(),
    );

    await user.click(
      within(
        screen.getByRole('listbox', {
          name: t('taskDetail', 'planning.planned.hourListLabel'),
        }),
      ).getByRole('option', { name: '09' }),
    );
    await user.click(
      within(
        screen.getByRole('listbox', {
          name: t('taskDetail', 'planning.planned.minuteListLabel'),
        }),
      ).getByRole('option', { name: '00' }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.plannedTime?.toString()).toBe('09:00:00');
    });
  });

  describe('Date shortcuts — арифметика `01§4`/`01§5`, детерминированно (инъекция «сегодня»)', () => {
    beforeEach(() => {
      // Понедельник 2026-08-31 — тот же опорный день, что тест
      // `@shagi/core/temporal/date-shortcuts.test.ts`. Фиксирует только
      // `Date` (`toFake:['Date']`) — `waitFor`/RTL продолжают опираться на
      // реальные таймеры, только "сегодня" внутри `Temporal.Now` детерминировано.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-08-31T10:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('«Завтра» ставит дату +1 день от «сегодня»', async () => {
      const user = userEvent.setup();
      const task = makeTask({ title: 'Задача' });
      const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

      await user.click(
        await screen.findByRole('button', { name: t('taskDetail', 'planning.planned.set') }),
      );
      await user.click(
        screen.getByRole('button', { name: t('taskDetail', 'planning.shortcuts.tomorrow') }),
      );

      await waitFor(async () => {
        const stored = await getStorage().tasks.findById(task.id);
        expect(stored?.plannedDate?.toString()).toBe('2026-09-01');
      });
    });

    it('«Выходные» на понедельник ставит ближайшую субботу', async () => {
      const user = userEvent.setup();
      const task = makeTask({ title: 'Задача' });
      const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

      await user.click(
        await screen.findByRole('button', { name: t('taskDetail', 'planning.planned.set') }),
      );
      await user.click(
        screen.getByRole('button', { name: t('taskDetail', 'planning.shortcuts.weekend') }),
      );

      await waitFor(async () => {
        const stored = await getStorage().tasks.findById(task.id);
        expect(stored?.plannedDate?.toString()).toBe('2026-09-05');
      });
    });

    it('«Следующая неделя» на понедельник ставит понедельник через 7 дней, не сегодня', async () => {
      const user = userEvent.setup();
      const task = makeTask({ title: 'Задача' });
      const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

      await user.click(
        await screen.findByRole('button', { name: t('taskDetail', 'planning.planned.set') }),
      );
      await user.click(
        screen.getByRole('button', { name: t('taskDetail', 'planning.shortcuts.nextWeek') }),
      );

      await waitFor(async () => {
        const stored = await getStorage().tasks.findById(task.id);
        expect(stored?.plannedDate?.toString()).toBe('2026-09-07');
      });
    });
  });

  it('Очистка Planned Date снимает время/фокус/day_bucket (правило домена), Duration остаётся', async () => {
    const user = userEvent.setup();
    const plannedDate = Temporal.Now.plainDateISO();
    const task = makeTask({
      title: 'Со всем сразу',
      plannedDate,
      focusDate: plannedDate,
      dayBucket: 'later',
    });
    // `Task` — размеченное объединение по `plannedDate`/`deadlineDate`/...
    // (`entities/task.ts`); спред `...task` с точечным переопределением
    // `plannedTime`/`durationMin` не сохраняет узнаваемость конкретной ветки
    // для компилятора (та же причина, по которой `assemble.ts` в `@shagi/core`
    // строит эти срезы явными билдерами, а не спредом) — `as Task` здесь
    // безопасен: обе комбинации (`plannedDate` задан + `plannedTime` задан +
    // `durationMin` задан) валидны по домену, просто вне зоны, где TS может
    // это вывести из спреда union-типа.
    const withDurationAndTime = {
      ...task,
      plannedTime: Temporal.PlainTime.from('09:00'),
      durationMin: makeDurationMinutes(30),
    } as Task;
    const { getStorage } = renderTaskDetail(task.id, { tasks: [withDurationAndTime] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.planned.clearDate') }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.plannedDate).toBeNull();
      expect(stored?.plannedTime).toBeNull();
      expect(stored?.focusDate).toBeNull();
      expect(stored?.dayBucket).toBe('default');
      // Duration — независимое поле, не зависит от Planned Date (`01§5`).
      expect(stored?.durationMin).toBe(30);
    });
  });

  it('Duration — числовой ввод сохраняется по blur (правило `01§1`: целые минуты 1..1440)', async () => {
    const task = makeTask({ title: 'Без длительности' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const input = await screen.findByLabelText(t('taskDetail', 'planning.duration.label'));
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.blur(input);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.durationMin).toBe(45);
    });
  });

  it('Deadline Date/Time — задаётся picker’ом (тот же принцип, что Planned)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Без срока' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.deadline.set') }),
    );
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.deadlineDate?.equals(Temporal.Now.plainDateISO())).toBe(true);
    });

    await waitFor(() =>
      expect(
        screen.getByRole('listbox', { name: t('taskDetail', 'planning.deadline.hourListLabel') }),
      ).toBeInTheDocument(),
    );
    await user.click(
      within(
        screen.getByRole('listbox', { name: t('taskDetail', 'planning.deadline.hourListLabel') }),
      ).getByRole('option', { name: '18' }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.deadlineTime?.toString().startsWith('18:')).toBe(true);
    });
  });

  it('Warning: planned > deadline показывает TemporalConflict, сохранение не блокируется', async () => {
    const deadlineDate = Temporal.Now.plainDateISO();
    const task = makeTask({ title: 'Конфликт', deadlineDate });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.planned.set') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.shortcuts.nextWeek') }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.plannedDate).not.toBeNull();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      t('taskDetail', 'planning.conflicts.plannedAfterDeadline'),
    );
  });

  it('Блокирующая ошибка (правило 3: planned_date < available_from) показывается у конкретного поля, не общим Toast', async () => {
    const user = userEvent.setup();
    const plannedDate = Temporal.Now.plainDateISO();
    const task = makeTask({ title: 'Скоро конфликт', plannedDate });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.availableFrom.set') }),
    );
    // Любая дата СЛЕДУЮЩЕГО месяца гарантированно позже plannedDate=«сегодня».
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstDayOfNextMonth] = await screen.findAllByRole('gridcell');
    if (firstDayOfNextMonth === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstDayOfNextMonth);

    await waitFor(() =>
      expect(
        screen.getByText(t('taskDetail', 'planning.errors.plannedBeforeAvailableFrom')),
      ).toBeInTheDocument(),
    );
    // Ничего не записалось — вся мутация отклонена целиком (валидатор видит
    // задачу как единое целое), не только «частично применена».
    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.availableFrom).toBeNull();
    expect(stored?.plannedDate?.equals(plannedDate)).toBe(true);

    // «Другое редактирование остаётся доступным» (`01§17`) — title всё ещё
    // редактируется и сохраняется после отклонённой мутации.
    const titleInput = screen.getByLabelText(t('taskDetail', 'title.label'));
    fireEvent.change(titleInput, { target: { value: 'Новое имя' } });
    fireEvent.blur(titleInput);
    await waitFor(async () => {
      const refreshed = await getStorage().tasks.findById(task.id);
      expect(refreshed?.title).toBe('Новое имя');
    });
  });

  it('«Добавить дату» открывает Planned Date picker, а не сообщение «скоро»', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Без дат' });
    renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'quickActions.addDate') }),
    );

    expect(
      screen.getByRole('dialog', { name: t('taskDetail', 'planning.planned.pickerTitle') }),
    ).toBeInTheDocument();
  });
});

describe('TaskDetail — Explicit Reminder (M31, `01§18`)', () => {
  it('«Добавить» создаёт explicit reminder через createExplicitReminderCommand', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Без напоминания' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      expect(reminders.some((r) => r.kind === 'explicit' && r.enabled)).toBe(true);
    });
    await waitFor(() =>
      expect(
        screen.getByText(formatDate(Temporal.Now.plainDateISO()), { exact: false }),
      ).toBeInTheDocument(),
    );
  });

  it('«Отменить» вызывает cancelReminderCommand — enabled становится false', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'С напоминанием' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      expect(reminders).toHaveLength(1);
    });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.cancel') }),
    );

    await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      expect(reminders.every((r) => !r.enabled)).toBe(true);
    });
    await waitFor(() =>
      expect(screen.getByText(t('taskDetail', 'planning.reminder.empty'))).toBeInTheDocument(),
    );
  });

  it('«Изменить напоминание» заменяет explicit reminder — cancel старого + create нового не блокируются правилом 19 (Task B8, ST10-расследование, реальный edit-flow)', async () => {
    // Живой прогон Task B8 (Android emulator smoke, Step 2c) поймал это
    // напрямую: после cancel(старый)+create(новый) в реальном SQLite не
    // оставалось ни одной enabled explicit-записи — `countExplicitByTask`
    // (правило 19, `02§2`) считал уже отменённую запись, `createExplicit
    // ReminderCommand` внутри `handleSubmitReminder` отвергал новую. Этот
    // тест воспроизводит РОВНО ТОТ ЖЕ production-flow (не изолированный
    // вызов команды) через реальный `storageBackend: {kind:'memory'}` —
    // тот же путь, что `renderTaskDetail` использует во всех соседних
    // тестах этого файла.
    const user = userEvent.setup();
    const task = makeTask({ title: 'Заменяемое напоминание' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    // Создаём reminder A — тот же приём, что и в предыдущем тесте.
    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    const reminderA = await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      const found = reminders.find((r) => r.kind === 'explicit' && r.enabled);
      if (found === undefined) throw new Error('reminder A ещё не создан');
      return found;
    });

    // «Изменить напоминание» — та же кнопка, что и «Добавить», но
    // `explicitReminder !== null` меняет её подпись (`TaskDetail.tsx`,
    // `openReminderPicker` предзаполняет picker текущими значениями A).
    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.change') }),
    );
    // Следующий месяц — гарантированно другая дата, чем «сегодня» (A),
    // тот же приём, что реконсиляционные тесты ниже используют для
    // получения заведомо отличного `triggerAt`.
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstDayOfNextMonth] = await screen.findAllByRole('gridcell');
    if (firstDayOfNextMonth === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstDayOfNextMonth);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    // Acceptance (владелец, Задача 1): ровно 1 enabled explicit reminder,
    // новый triggerAt, старый — не active.
    await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      const enabledExplicit = reminders.filter((r) => r.kind === 'explicit' && r.enabled);
      expect(enabledExplicit).toHaveLength(1);
      expect(enabledExplicit[0]?.id).not.toBe(reminderA.id);
    });
    const reminders = await getStorage().reminders.listByTask(task.id);
    const oldReminder = reminders.find((r) => r.id === reminderA.id);
    expect(oldReminder?.enabled).toBe(false);

    // История/синхронизационные данные старого reminder не уничтожены
    // произвольно (владелец, Задача 1) — запись физически осталась в
    // хранилище (`enabled:false`, не удалена), тот же upsert-канал, что и
    // отдельный тест «Отменить» выше проверяет напрямую.
    expect(reminders).toHaveLength(2);

    // Новый triggerAt — реально ПЕРВЫЙ день следующего месяца (та самая
    // ячейка, которую кликнули), а не «сегодня + 1 месяц» (при переполнении
    // конца месяца это разные даты) — читаем `localRuleJson` напрямую,
    // не полагаясь на форматирование экрана.
    const expectedFirstOfNextMonth = Temporal.Now.plainDateISO()
      .with({ day: 1 })
      .add({ months: 1 });
    const newReminder = reminders.find((r) => r.kind === 'explicit' && r.enabled);
    expect((newReminder?.localRuleJson as { date?: string } | undefined)?.date).toBe(
      expectedFirstOfNextMonth.toString(),
    );
  });

  it('второй explicit reminder на ту же задачу, минуя cancel, по-прежнему запрещён — правило 19 не ослаблено фиксом countExplicitByTask', async () => {
    const task = makeTask({ title: 'Уже с напоминанием' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });
    const reminder = makeExplicitReminder(task.id);
    await seedReminder(getStorage(), reminder);

    const result = await createExplicitReminderCommand(
      {
        taskId: task.id,
        date: Temporal.Now.plainDateISO().add({ months: 1 }),
        time: null,
        deadlineDate: null,
        deadlineTime: null,
      },
      {
        storage: getStorage(),
        now: Temporal.Now.instant(),
        nowLocal: Temporal.Now.plainDateTimeISO(),
        deviceId: generateUuidV7(),
      },
    );

    expect(result.status).toBe('rejected');
    const reminders = await getStorage().reminders.listByTask(task.id);
    expect(reminders.filter((r) => r.kind === 'explicit' && r.enabled)).toHaveLength(1);
  });

  it('конкурентная запись ДРУГОГО active explicit reminder ПЕРЕД «Сохранить» отклоняет замену БЕЗ единой мутации — старый reminder остаётся нетронутым, ошибка видна (Task B8, Задача 4, обновлено под атомарную Задачу 3)', async () => {
    // До Задачи 3 (атомарная замена) сценарий назывался "гонка между
    // cancel и create" — раздельные команды успевали отменить старое ДО
    // проверки лимита для нового. `replaceExplicitReminderCommand`
    // проверяет правило 19 (исключая себя) ДО единственной атомарной
    // мутации (`reminder-replace.ts`) — при конкурентной записи отказ
    // происходит РАНЬШЕ любой записи: старый reminder вообще не
    // трогается, а не «уже отменён, новое не создано». Задача 4 (`loadAll()`
    // в отклонённой ветке) остаётся защитным механизмом на случай ЛЮБОГО
    // будущего отказа, но эта конкретная гонка теперь не оставляет
    // storage ни в каком промежуточном состоянии вовсе — сильнее, чем
    // просто «экран не врёт». Эмулируется прямой записью в storage «за
    // спиной» экрана непосредственно перед кликом «Сохранить».
    const user = userEvent.setup();
    const task = makeTask({ title: 'Гонка при замене' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );
    const original = await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      const found = reminders.find((r) => r.kind === 'explicit' && r.enabled);
      if (found === undefined) throw new Error('исходный reminder ещё не создан');
      return found;
    });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.change') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstDayOfNextMonth] = await screen.findAllByRole('gridcell');
    if (firstDayOfNextMonth === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstDayOfNextMonth);

    // Конкурентная запись — «другое устройство» создало свой active
    // explicit reminder на эту же задачу прямо сейчас, пока эта форма
    // ещё открыта.
    const concurrent = makeExplicitReminder(task.id);
    await seedReminder(getStorage(), concurrent);

    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    // Ошибка ВИДНА — не silent rejection.
    await waitFor(() =>
      expect(screen.getByText(t('taskDetail', 'planning.reminder.limitError'))).toBeInTheDocument(),
    );
    // Атомарность (Задача 3): НИ ОДНОЙ мутации не произошло — исходный
    // reminder остался ENABLED (не тронут вовсе, не «уже отменён»),
    // конкурентный тоже цел, новый НЕ создан. Ровно 2 enabled
    // explicit-записи на задачу — обе исходные, ни одной новой.
    const reminders = await getStorage().reminders.listByTask(task.id);
    const enabledExplicit = reminders.filter((r) => r.kind === 'explicit' && r.enabled);
    expect(enabledExplicit.map((r) => r.id).toSorted()).toEqual(
      [original.id, concurrent.id].toSorted(),
    );
    const storedOriginal = reminders.find((r) => r.id === original.id);
    expect(storedOriginal?.enabled).toBe(true);
  });
});

describe('TaskDetail — Explicit Reminder: реконсиляция расписания (00§7 шаг 5, Task A4)', () => {
  it('успешное создание вызывает scheduler.schedule с id нового напоминания', async () => {
    const user = userEvent.setup();
    const scheduler = fakeScheduler();
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const task = makeTask({ title: 'Без напоминания' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] }, 'todayEmpty', host);

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    // Следующий месяц, не «сегодня» — при пустом времени `firesAt` падает
    // на полночь ДАТЫ (`buildExplicitLocalRuleJson`, `@shagi/core`), и
    // «сегодня в полночь» уже в прошлом относительно момента запуска
    // теста — реконсиляция намеренно не реплеит просроченное (`01§18`
    // Testing Acceptance #34), `schedule` не вызвался бы. Любая дата
    // следующего месяца гарантированно в будущем — тот же приём, что
    // `planning.picker.nextMonth` тест выше в файле.
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstDayOfNextMonth] = await screen.findAllByRole('gridcell');
    if (firstDayOfNextMonth === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstDayOfNextMonth);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    const reminder = await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      const found = reminders.find((r) => r.kind === 'explicit' && r.enabled);
      if (found === undefined) throw new Error('напоминание ещё не создано');
      return found;
    });
    await waitFor(() => expect(scheduler.calls.scheduled).toEqual([reminder.id]));
  });

  it('«Отменить» вызывает scheduler.cancel с id отменённого напоминания', async () => {
    const user = userEvent.setup();
    const scheduler = fakeScheduler();
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const task = makeTask({ title: 'С напоминанием' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] }, 'todayEmpty', host);

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstDayOfNextMonth] = await screen.findAllByRole('gridcell');
    if (firstDayOfNextMonth === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstDayOfNextMonth);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    const reminder = await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      const found = reminders.find((r) => r.kind === 'explicit' && r.enabled);
      if (found === undefined) throw new Error('напоминание ещё не создано');
      return found;
    });
    await waitFor(() => expect(scheduler.calls.scheduled).toEqual([reminder.id]));

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.cancel') }),
    );

    await waitFor(() => expect(scheduler.calls.cancelled).toEqual([reminder.id]));
  });
});

describe('TaskDetail — ST10: capability notice для inexact alarm (Task B6, `01§18`/`00§11.1`)', () => {
  it('после создания напоминания на платформе, где getSchedulingCapability вернула inexact, показывает disclosure с кнопкой настроек', async () => {
    const user = userEvent.setup();
    const scheduler = fakeScheduler([], 'inexact');
    const openSettings = vi.fn(async () => undefined);
    const host: AppHost = {
      platform: {
        ...createUnavailablePlatform(),
        notificationScheduler: scheduler,
        exactAlarmSettings: { openSettings },
      },
      storageBackend: { kind: 'memory' },
    };
    const task = makeTask({ title: 'Без напоминания' });
    renderTaskDetail(task.id, { tasks: [task] }, 'todayEmpty', host);

    // До создания напоминания — экран ещё не спрашивал платформу
    // (just-in-time, не upfront-запрос §18), disclosure не показан.
    expect(
      screen.queryByText(t('taskDetail', 'planning.reminder.inexactNotice')),
    ).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    // Следующий месяц — тот же приём, что и соседний тест реконсиляции
    // выше: «сегодня в полночь» уже в прошлом относительно момента
    // запуска теста, а `createExplicitReminderCommand` не примет дату в
    // прошлом.
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstDayOfNextMonth] = await screen.findAllByRole('gridcell');
    if (firstDayOfNextMonth === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstDayOfNextMonth);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(t('taskDetail', 'planning.reminder.inexactNotice')),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: t('taskDetail', 'planning.reminder.openExactAlarmSettings'),
      }),
    );
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('без exactAlarmSettings на платформе (Web/Windows) disclosure показывается без кнопки настроек (isAvailable-гвард)', async () => {
    const user = userEvent.setup();
    const scheduler = fakeScheduler([], 'inexact');
    const host: AppHost = {
      // `exactAlarmSettings` намеренно НЕ переопределён — остаётся
      // `Unavailable` из `createUnavailablePlatform()`, тот же случай, что
      // `apps/web|desktop/src/platform.ts` этой задачи.
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const task = makeTask({ title: 'Без напоминания' });
    renderTaskDetail(task.id, { tasks: [task] }, 'todayEmpty', host);

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstDayOfNextMonth] = await screen.findAllByRole('gridcell');
    if (firstDayOfNextMonth === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstDayOfNextMonth);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(t('taskDetail', 'planning.reminder.inexactNotice')),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', {
        name: t('taskDetail', 'planning.reminder.openExactAlarmSettings'),
      }),
    ).not.toBeInTheDocument();
  });

  it('ST10 подтверждается и на EDIT-пути (замена существующего напоминания), не только на первом create (Task B8, Задача 5 — регрессия после фикса countExplicitByTask)', async () => {
    // Подтверждает исходный B6 contract ПОСЛЕ исправления более ранней
    // причины (Задача 2/countExplicitByTask): до фикса это ветвление до
    // `reconcileTaskReminders()`/`setSchedulingPrecision()` просто не
    // доходило (`create` отклонялся правилом 19, экран падал в
    // stale-состояние — Задача 4) — здесь весь путь целиком: exact
    // capability=false → замена существующего напоминания реально
    // остаётся enabled в хранилище → reconcile вызван → scheduler.schedule
    // получил id НОВОГО напоминания → ST10 notice виден.
    const user = userEvent.setup();
    const scheduler = fakeScheduler([], 'inexact');
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const task = makeTask({ title: 'Замена при inexact capability' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] }, 'todayEmpty', host);

    // Создаём A — с той же (inexact) capability, ST10 уже видна после
    // create (соседний тест выше это отдельно проверяет). Следующий
    // месяц, НЕ «сегодня» — та же ловушка, что и в соседних
    // реконсиляционных тестах этого файла: «сегодня в полночь» уже в
    // прошлом относительно момента запуска теста, реконсиляция намеренно
    // не реплеит просроченное (`01§18` Testing Acceptance #34), `schedule`
    // не вызвался бы вовсе.
    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.add') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstOfMonthForA] = await screen.findAllByRole('gridcell');
    if (firstOfMonthForA === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstOfMonthForA);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );
    const reminderA = await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      const found = reminders.find((r) => r.kind === 'explicit' && r.enabled);
      if (found === undefined) throw new Error('reminder A ещё не создан');
      return found;
    });
    await waitFor(() => expect(scheduler.calls.scheduled).toContain(reminderA.id));
    await waitFor(() =>
      expect(
        screen.getByText(t('taskDetail', 'planning.reminder.inexactNotice')),
      ).toBeInTheDocument(),
    );

    // Замена — «Изменить напоминание», новая дата, «Сохранить».
    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.reminder.change') }),
    );
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.picker.nextMonth') }),
    );
    const [firstDayOfNextMonth] = await screen.findAllByRole('gridcell');
    if (firstDayOfNextMonth === undefined) throw new Error('ожидалась хотя бы одна ячейка');
    await user.click(firstDayOfNextMonth);
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'planning.reminder.save') }),
    );

    // Замена реально осталась ENABLED в хранилище (не жертва Задачи
    // 2/4-регрессии) — ровно одна active explicit-запись, с НОВЫМ id.
    const reminderB = await waitFor(async () => {
      const reminders = await getStorage().reminders.listByTask(task.id);
      const enabledExplicit = reminders.filter((r) => r.kind === 'explicit' && r.enabled);
      if (enabledExplicit.length !== 1) throw new Error('замена ещё не применилась');
      const [only] = enabledExplicit;
      if (only === undefined || only.id === reminderA.id) throw new Error('всё ещё старый id');
      return only;
    });

    // Reconcile реально вызвал scheduler.schedule для НОВОГО id (не
    // просто «что-то запланировалось») — и ST10 снова видна.
    await waitFor(() => expect(scheduler.calls.scheduled).toContain(reminderB.id));
    await waitFor(() =>
      expect(
        screen.getByText(t('taskDetail', 'planning.reminder.inexactNotice')),
      ).toBeInTheDocument(),
    );
  });
});

describe('TaskDetail — Organization: приоритет (после E08.2 — тот же экран, без регрессии)', () => {
  it('«Приоритет» открывает picker приоритета', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача' });
    renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'quickActions.priority') }),
    );

    expect(
      screen.getByRole('dialog', { name: t('taskDetail', 'organization.priorityPickerTitle') }),
    ).toBeInTheDocument();
  });

  it('«Добавить заметку» фокусирует поле описания', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача' });
    renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'quickActions.addNote') }),
    );

    expect(screen.getByLabelText(t('taskDetail', 'description.label'))).toHaveFocus();
  });
});

describe('TaskDetail — Organization: приоритет', () => {
  it('выбор уровня в picker меняет priority через updateTaskCommand', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Приоритетная' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', {
        name: t('taskDetail', 'organization.priorityChangeLabel'),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: t('taskDetail', 'organization.priorityP1') }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.priority).toBe(1);
    });
  });
});

describe('TaskDetail — Organization: метки', () => {
  it('клик по метке назначает её задаче (attachLabelToTaskCommand)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача с меткой' });
    const label = makeLabel({ displayName: 'важное' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task], labels: [label] });

    const toggle = await screen.findByRole('button', { name: 'важное' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    await waitFor(async () => {
      const links = await getStorage().taskLabels.listByTask(task.id);
      expect(links.some((link) => link.labelId === label.id)).toBe(true);
    });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
  });

  it('повторный клик по уже назначенной метке снимает её (detachLabelFromTaskCommand)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача' });
    const label = makeLabel({ displayName: 'срочное' });
    const link = makeTaskLabel(task.id, label.id, {
      physical: Temporal.Now.instant(),
      logical: 0,
      deviceId: null,
    });
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      labels: [label],
      taskLabels: [link],
    });

    const toggle = await screen.findByRole('button', { name: 'срочное' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    await user.click(toggle);

    await waitFor(async () => {
      const links = await getStorage().taskLabels.listByTask(task.id);
      expect(links.filter(isTaskLabelActive).some((l) => l.labelId === label.id)).toBe(false);
    });
  });

  it('мини-форма создаёт новую метку (createLabelCommand)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const input = await screen.findByLabelText(t('taskDetail', 'organization.newLabelPlaceholder'));
    await user.type(input, 'новая метка{Enter}');

    await waitFor(async () => {
      const labels = await getStorage().labels.listAll();
      expect(labels.some((l) => l.displayName === 'новая метка')).toBe(true);
    });
  });
});

describe('TaskDetail — Organization: проект/раздел', () => {
  it('выбор проекта в picker пишет projectId + снимок имени', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Мигрирующая' });
    const project = makeProject({ title: 'Целевой проект' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task], projects: [project] });

    await user.click(
      await screen.findByRole('button', {
        name: t('taskDetail', 'organization.projectChangeLabel'),
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Целевой проект' }));

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.projectId).toBe(project.id);
      expect(stored?.originalProjectNameSnapshot).toBe('Целевой проект');
    });
  });

  it('выбор раздела в picker пишет sectionId + снимок имени', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'Проект с разделами' });
    const target = makeSection(project.id);
    const task = makeTask({ title: 'Уже в проекте', projectId: project.id });
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      projects: [project],
      sections: [target],
    });

    await user.click(
      await screen.findByRole('button', {
        name: t('taskDetail', 'organization.sectionChangeLabel'),
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Проверочная секция' }));

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.sectionId).toBe(target.id);
      expect(stored?.originalSectionNameSnapshot).toBe('Проверочная секция');
    });
  });

  it('кнопка «Изменить раздел» не показана, пока у задачи нет проекта', async () => {
    const task = makeTask({ title: 'Без проекта пока' });
    renderTaskDetail(task.id, { tasks: [task] });

    await screen.findByLabelText(t('taskDetail', 'title.label'));
    expect(
      screen.queryByRole('button', { name: t('taskDetail', 'organization.sectionChangeLabel') }),
    ).not.toBeInTheDocument();
  });
});

describe('TaskDetail — Subtasks', () => {
  it('инлайн-добавление создаёт subtask (createTaskCommand с parentTaskId)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Родитель' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const input = await screen.findByLabelText(t('taskDetail', 'subtasks.addPlaceholder'));
    await user.type(input, 'Первая подзадача{Enter}');

    await waitFor(() => expect(screen.getByText('Первая подзадача')).toBeInTheDocument());
    const subtasks = await getStorage().tasks.listDirectSubtasks(task.id, 'active');
    expect(subtasks).toHaveLength(1);
    expect(subtasks[0]?.parentTaskId).toBe(task.id);
  });

  it('чекбокс завершает subtask, «Удалить» soft-удаляет её', async () => {
    const user = userEvent.setup();
    const parent = makeTask({ title: 'Родитель 2' });
    const subtask = makeTask({
      title: 'Дочерняя',
      parentTaskId: parent.id,
      projectId: null,
      captureState: 'processed',
    });
    const { getStorage } = renderTaskDetail(parent.id, { tasks: [parent, subtask] });

    await waitFor(() => expect(screen.getByText('Дочерняя')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Дочерняя' }));

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(subtask.id);
      expect(stored?.status).toBe('completed');
    });
  });

  it('«В чек-лист» требует подтверждения и конвертирует subtask (convertSubtaskToChecklistItemCommand)', async () => {
    const user = userEvent.setup();
    const parent = makeTask({ title: 'Родитель 3' });
    const subtask = makeTask({
      title: 'Стать пунктом',
      parentTaskId: parent.id,
      projectId: null,
      captureState: 'processed',
    });
    const { getStorage } = renderTaskDetail(parent.id, { tasks: [parent, subtask] });

    await waitFor(() => expect(screen.getByText('Стать пунктом')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('taskDetail', 'subtasks.convertToChecklistLabel', { title: 'Стать пунктом' }),
      }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: t('taskDetail', 'subtasks.convertConfirmTitle'),
    });
    await user.click(
      within(dialog).getByRole('button', {
        name: t('taskDetail', 'subtasks.convertConfirmConfirm'),
      }),
    );

    await waitFor(async () => {
      const items = await getStorage().checklistItems.listByTask(parent.id);
      expect(items.some((item) => item.text === 'Стать пунктом')).toBe(true);
    });
    const storedSubtask = await getStorage().tasks.findById(subtask.id);
    expect(storedSubtask?.deletedAt).not.toBeNull();
  });
});

describe('TaskDetail — Subtasks: реконсиляция расписания напоминаний (00§7 шаг 5, Task A4)', () => {
  it('завершение subtask с активным напоминанием отменяет его в scheduler', async () => {
    const user = userEvent.setup();
    const parent = makeTask({ title: 'Родитель с напоминанием у подзадачи' });
    const subtask = makeTask({
      title: 'Подзадача с напоминанием',
      parentTaskId: parent.id,
      projectId: null,
      captureState: 'processed',
    });
    // Напоминание уже «запланировано» ДО монтирования (см. комментарий
    // `fakeScheduler`) — так тест проверяет именно `cancel`, а не побочный
    // `schedule` от idempotency-пути.
    const reminder = makeExplicitReminder(subtask.id);
    const scheduler = fakeScheduler([reminder.id]);
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const { getStorage } = renderTaskDetail(
      parent.id,
      { tasks: [parent, subtask] },
      'todayEmpty',
      host,
    );
    await waitFor(() => expect(screen.getByText('Подзадача с напоминанием')).toBeInTheDocument());
    await seedReminder(getStorage(), reminder);

    await user.click(screen.getByRole('checkbox', { name: 'Подзадача с напоминанием' }));

    await waitFor(() => expect(scheduler.calls.cancelled).toEqual([reminder.id]));
  });

  it('удаление subtask с активным напоминанием отменяет его в scheduler', async () => {
    const user = userEvent.setup();
    const parent = makeTask({ title: 'Родитель, удаление подзадачи' });
    const subtask = makeTask({
      title: 'Удаляемая с напоминанием',
      parentTaskId: parent.id,
      projectId: null,
      captureState: 'processed',
    });
    const reminder = makeExplicitReminder(subtask.id);
    const scheduler = fakeScheduler([reminder.id]);
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const { getStorage } = renderTaskDetail(
      parent.id,
      { tasks: [parent, subtask] },
      'todayEmpty',
      host,
    );
    await waitFor(() => expect(screen.getByText('Удаляемая с напоминанием')).toBeInTheDocument());
    await seedReminder(getStorage(), reminder);

    await user.click(
      screen.getByRole('button', {
        name: t('taskDetail', 'subtasks.deleteLabel', { title: 'Удаляемая с напоминанием' }),
      }),
    );

    await waitFor(() => expect(scheduler.calls.cancelled).toEqual([reminder.id]));
  });
});

describe('TaskDetail — главная задача: реконсиляция после Завершить/Пропустить (Task B5)', () => {
  it('главный чекбокс «Завершить» с активным напоминанием отменяет его в scheduler', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Главная задача с напоминанием' });
    // Напоминание уже «запланировано» ДО монтирования (см. комментарий
    // `fakeScheduler`) — так тест проверяет именно `cancel`, а не побочный
    // `schedule` от idempotency-пути (Task A6).
    const reminder = makeExplicitReminder(task.id);
    const scheduler = fakeScheduler([reminder.id]);
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] }, 'todayEmpty', host);
    const checkbox = await screen.findByRole('checkbox', {
      name: t('taskDetail', 'completeCheckbox.label', { title: 'Главная задача с напоминанием' }),
    });
    await seedReminder(getStorage(), reminder);

    await user.click(checkbox);

    // `handleComplete` идёт через `completeOccurrenceCommand`, не
    // `completeTaskCommand` напрямую (E11.2) — до фикса Task B5 этот путь не
    // вызывал `reconcileTaskReminders` вовсе (единственный экран с этим
    // пробелом: `Today.tsx`/`Inbox.tsx`/`Plan.tsx`/`Search.tsx` уже покрыты).
    await waitFor(() => expect(scheduler.calls.cancelled).toEqual([reminder.id]));
  });

  it('«Пропустить это повторение» с активным напоминанием отменяет его в scheduler', async () => {
    const user = userEvent.setup();
    const series = seedRecurrenceSeries();
    const today = Temporal.Now.plainDateISO();
    const task = makeTask({
      title: 'Повтор с напоминанием',
      plannedDate: today,
      seriesId: series.id,
      occurrenceSeq: 1n,
    });
    const reminder = makeExplicitReminder(task.id);
    const scheduler = fakeScheduler([reminder.id]);
    const host: AppHost = {
      platform: { ...createUnavailablePlatform(), notificationScheduler: scheduler },
      storageBackend: { kind: 'memory' },
    };
    const { getStorage } = renderTaskDetail(
      task.id,
      { tasks: [task], recurrenceSeries: [series] },
      'todayEmpty',
      host,
    );
    const skipButton = await screen.findByRole('button', {
      name: t('taskDetail', 'organization.skipOccurrence'),
    });
    await seedReminder(getStorage(), reminder);

    await user.click(skipButton);

    await waitFor(() => expect(scheduler.calls.cancelled).toEqual([reminder.id]));
  });
});

describe('TaskDetail — Checklist', () => {
  it('инлайн-добавление создаёт пункт (createChecklistItemCommand)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'С чек-листом' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const input = await screen.findByLabelText(t('taskDetail', 'checklist.addPlaceholder'));
    await user.type(input, 'Купить молоко{Enter}');

    await waitFor(() => expect(screen.getByText('Купить молоко')).toBeInTheDocument());
    const items = await getStorage().checklistItems.listByTask(task.id);
    expect(items).toHaveLength(1);
  });

  it('чекбокс переключает done, «Удалить» soft-удаляет пункт', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача' });
    const item = makeChecklistItem(task.id);
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      checklistItems: [item],
    });

    await waitFor(() => expect(screen.getByText('пункт чек-листа')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'пункт чек-листа' }));

    await waitFor(async () => {
      const items = await getStorage().checklistItems.listByTask(task.id);
      expect(items.find((i) => i.id === item.id)?.done).toBe(true);
    });

    await user.click(
      screen.getByRole('button', {
        name: t('taskDetail', 'checklist.deleteLabel', { text: 'пункт чек-листа' }),
      }),
    );

    await waitFor(async () => {
      const items = await getStorage().checklistItems.listByTask(task.id);
      expect(items).toHaveLength(0);
    });
  });

  it('«В подзадачу» конвертирует пункт без подтверждения (convertChecklistItemToSubtaskCommand)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Задача с пунктом' });
    const item = makeChecklistItem(task.id);
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      checklistItems: [item],
    });

    await waitFor(() => expect(screen.getByText('пункт чек-листа')).toBeInTheDocument());
    await user.click(
      screen.getByRole('button', {
        name: t('taskDetail', 'checklist.convertToSubtaskLabel', { text: 'пункт чек-листа' }),
      }),
    );

    await waitFor(async () => {
      const subtasks = await getStorage().tasks.listDirectSubtasks(task.id, 'active');
      expect(subtasks.some((s) => s.title === 'пункт чек-листа')).toBe(true);
    });
    const items = await getStorage().checklistItems.listByTask(task.id);
    expect(items).toHaveLength(0);
  });
});

describe('TaskDetail — повторы (E11.2)', () => {
  it('главный чекбокс recurring-задачи вызывает completeOccurrenceCommand и генерирует следующий occurrence', async () => {
    const user = userEvent.setup();
    const series = seedRecurrenceSeries();
    const today = Temporal.Now.plainDateISO();
    const task = makeTask({
      title: 'Полить цветы',
      plannedDate: today,
      seriesId: series.id,
      occurrenceSeq: 1n,
    });
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      recurrenceSeries: [series],
    });

    const checkbox = await screen.findByRole('checkbox', {
      name: t('taskDetail', 'completeCheckbox.label', { title: 'Полить цветы' }),
    });
    await user.click(checkbox);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.status).toBe('completed');
    });

    const nextOccurrences = await getStorage().tasks.listBySeries(series.id, 'active');
    expect(nextOccurrences).toHaveLength(1);
    expect(nextOccurrences[0]?.plannedDate?.toString()).toBe(today.add({ days: 1 }).toString());
  });

  it('обычная (не recurring) задача по-прежнему завершается чекбоксом как раньше (регрессия)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Обычная без повтора' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    const checkbox = await screen.findByRole('checkbox', {
      name: t('taskDetail', 'completeCheckbox.label', { title: 'Обычная без повтора' }),
    });
    await user.click(checkbox);

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.status).toBe('completed');
      expect(stored?.completionKind).toBe('done');
    });
  });

  it('показывает RecurrenceChip с текстом правила для recurring-задачи', async () => {
    const series = seedRecurrenceSeries({ templateJson: { unit: 'day', interval: 1 } });
    const task = makeTask({
      title: 'Ежедневная задача',
      seriesId: series.id,
      occurrenceSeq: 1n,
    });
    renderTaskDetail(task.id, { tasks: [task], recurrenceSeries: [series] });

    await waitFor(() =>
      expect(screen.getByText(t('taskDetail', 'recurrence.everyDay'))).toBeInTheDocument(),
    );
  });

  it('не показывает блок повтора для обычной задачи', async () => {
    const task = makeTask({ title: 'Совсем обычная' });
    renderTaskDetail(task.id, { tasks: [task] });

    await screen.findByLabelText(t('taskDetail', 'title.label'));
    expect(
      screen.queryByText(t('taskDetail', 'organization.recurrenceTitle')),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('taskDetail', 'organization.skipOccurrence') }),
    ).not.toBeInTheDocument();
  });

  it('«Пропустить это повторение» помечает completionKind=skipped и создаёт следующий occurrence', async () => {
    const user = userEvent.setup();
    const series = seedRecurrenceSeries();
    const today = Temporal.Now.plainDateISO();
    const task = makeTask({
      title: 'Тренировка',
      plannedDate: today,
      seriesId: series.id,
      occurrenceSeq: 1n,
    });
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      recurrenceSeries: [series],
    });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'organization.skipOccurrence') }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.completionKind).toBe('skipped');
    });

    const nextOccurrences = await getStorage().tasks.listBySeries(series.id, 'active');
    expect(nextOccurrences).toHaveLength(1);
    expect(nextOccurrences[0]?.plannedDate?.toString()).toBe(today.add({ days: 1 }).toString());
  });

  it('«Удалить всю серию» (после подтверждения) tombstone-ит occurrence, останавливает серию и возвращает на returnScreen', async () => {
    const user = userEvent.setup();
    const series = seedRecurrenceSeries();
    const task = makeTask({
      title: 'Серия под удаление',
      seriesId: series.id,
      occurrenceSeq: 1n,
    });
    const { getStorage, controller } = renderTaskDetail(
      task.id,
      { tasks: [task], recurrenceSeries: [series] },
      'todayEmpty',
    );

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'organization.deleteSeries') }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: t('taskDetail', 'organization.deleteSeriesConfirmTitle'),
    });
    await user.click(
      within(dialog).getByRole('button', {
        name: t('taskDetail', 'organization.deleteSeriesConfirmConfirm'),
      }),
    );

    await waitFor(() => expect(controller.getState().screen).toBe('todayEmpty'));

    const storedTask = await getStorage().tasks.findById(task.id);
    expect(storedTask?.deletedAt).not.toBeNull();

    const storedSeries = await getStorage().recurrenceSeries.findById(series.id);
    expect(storedSeries?.active).toBe(false);
    expect(storedSeries?.stopAfterOccurrenceSeq).toBe(1n);
  });
});

describe('TaskDetail — M26: диалог выбора области применения Planning-патча recurring-задачи', () => {
  it('Planning-патч recurring-задачи открывает диалог и НЕ коммитит немедленно', async () => {
    const user = userEvent.setup();
    const series = seedRecurrenceSeries();
    const task = makeTask({ title: 'Полить цветы', seriesId: series.id, occurrenceSeq: 1n });
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      recurrenceSeries: [series],
    });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.availableFrom.set') }),
    );
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);

    await screen.findByRole('dialog', { name: t('taskDetail', 'planning.recurringScope.title') });

    // Патч ещё НЕ применён — ждёт выбора области.
    const stored = await getStorage().tasks.findById(task.id);
    expect(stored?.availableFrom).toBeNull();
  });

  it('для НЕ recurring задачи диалог не появляется — Planning-патч коммитится напрямую (регрессия M24/M25)', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Обычная задача' });
    const { getStorage } = renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.availableFrom.set') }),
    );
    const todayCell = await screen.findByRole('gridcell', { current: 'date' });
    await user.click(todayCell);

    expect(
      screen.queryByRole('dialog', { name: t('taskDetail', 'planning.recurringScope.title') }),
    ).not.toBeInTheDocument();
    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.availableFrom?.equals(Temporal.Now.plainDateISO())).toBe(true);
    });
  });

  it('«Это повторение» коммитит текущий occurrence и НЕ трогает серию', async () => {
    const user = userEvent.setup();
    const series = seedRecurrenceSeries();
    const task = makeTask({ title: 'Полить цветы', seriesId: series.id, occurrenceSeq: 1n });
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      recurrenceSeries: [series],
    });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.availableFrom.set') }),
    );
    await user.click(await screen.findByRole('gridcell', { current: 'date' }));
    const dialog = await screen.findByRole('dialog', {
      name: t('taskDetail', 'planning.recurringScope.title'),
    });
    await user.click(
      within(dialog).getByRole('radio', {
        name: t('taskDetail', 'planning.recurringScope.occurrence'),
      }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.availableFrom?.equals(Temporal.Now.plainDateISO())).toBe(true);
    });
    const storedSeries = await getStorage().recurrenceSeries.findById(series.id);
    expect(storedSeries?.templateRevision).toBe(1n);
    expect(storedSeries?.templateJson).toEqual(series.templateJson);
  });

  it('«Вся серия» коммитит текущий occurrence И записывает новый шаблон в серию', async () => {
    const user = userEvent.setup();
    const series = seedRecurrenceSeries();
    const task = makeTask({ title: 'Полить цветы', seriesId: series.id, occurrenceSeq: 1n });
    const { getStorage } = renderTaskDetail(task.id, {
      tasks: [task],
      recurrenceSeries: [series],
    });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'planning.availableFrom.set') }),
    );
    await user.click(await screen.findByRole('gridcell', { current: 'date' }));
    const dialog = await screen.findByRole('dialog', {
      name: t('taskDetail', 'planning.recurringScope.title'),
    });
    await user.click(
      within(dialog).getByRole('radio', {
        name: t('taskDetail', 'planning.recurringScope.series'),
      }),
    );

    await waitFor(async () => {
      const stored = await getStorage().tasks.findById(task.id);
      expect(stored?.availableFrom?.equals(Temporal.Now.plainDateISO())).toBe(true);
    });
    const storedSeries = await getStorage().recurrenceSeries.findById(series.id);
    expect(storedSeries?.templateRevision).toBe(2n);
  });
});
