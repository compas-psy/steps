import { useEffect, useState, type ReactElement } from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import { createUnavailablePlatform } from '@shagi/platform';
import { formatDate, t } from '@shagi/i18n';
import {
  makeChecklistItem,
  makeLabel,
  makeOutboxEntry,
  makeProject,
  makeSection,
  makeTask,
  makeTaskLabel,
} from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { ChecklistItem, Label, Project, Section, Task, Uuid } from '@shagi/core';
import { isTaskLabelActive } from '@shagi/core';
import { describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController, type ScreenId } from '../../src/state/store.js';
import { TaskDetail } from '../../src/screens/TaskDetail.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

interface Seed {
  readonly projects?: readonly Project[];
  readonly sections?: readonly Section[];
  readonly tasks?: readonly Task[];
  readonly checklistItems?: readonly ChecklistItem[];
  readonly labels?: readonly Label[];
  readonly taskLabels?: readonly ReturnType<typeof makeTaskLabel>[];
}

async function seed(storage: StoragePort, entities: Seed): Promise<void> {
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
): { getStorage: () => StoragePort; controller: ReturnType<typeof createAppController> } {
  const controller = createAppController({
    screen: 'taskDetail',
    selectedTaskId: taskId,
    returnScreen: fromScreen,
  });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
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

describe('TaskDetail — Planning (только чтение, см. решение по объёму)', () => {
  it('показывает уже заданные дату/срок как текст, без интерактивных полей дат', async () => {
    const plannedDate = Temporal.Now.plainDateISO().add({ days: 1 });
    const deadlineDate = Temporal.Now.plainDateISO().add({ days: 3 });
    const task = makeTask({ title: 'С датами', plannedDate, deadlineDate });
    renderTaskDetail(task.id, { tasks: [task] });

    await waitFor(() =>
      expect(
        screen.getByText(
          t('taskDetail', 'planning.plannedLabel', { date: formatDate(plannedDate) }),
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        t('taskDetail', 'planning.deadlineLabel', { date: formatDate(deadlineDate) }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(t('taskDetail', 'planning.comingSoon'))).toBeInTheDocument();
    // Честно: ни один календарь/date-picker здесь не рендерится.
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('«Добавить дату» показывает честное сообщение «скоро», не открывает редактор', async () => {
    const user = userEvent.setup();
    const task = makeTask({ title: 'Без дат' });
    renderTaskDetail(task.id, { tasks: [task] });

    await user.click(
      await screen.findByRole('button', { name: t('taskDetail', 'quickActions.addDate') }),
    );

    expect(
      screen.getByText(t('taskDetail', 'quickActions.addDateUnavailable')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

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
