import { useEffect, useState, type ReactElement } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import { makeLabel, makeOutboxEntry, makeProject } from '@shagi/storage/contract';
import type { StoragePort } from '@shagi/storage';
import type { Project, Label } from '@shagi/core';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController, type QuickAddOrigin } from '../../src/state/store.js';
import { QuickAdd } from '../../src/screens/QuickAdd.js';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
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

async function seedLabels(storage: StoragePort, labels: readonly Label[]): Promise<void> {
  for (const label of labels) {
    await storage.runTransaction(async (tx) => {
      await tx.applyMutation({
        writes: [{ entity: 'label', value: label }],
        outbox: [makeOutboxEntry('label', label.id)],
      });
    });
  }
}

/** Тот же приём захвата `storage`, что `Inbox.test.tsx`/`Today.test.tsx` —
 * сеет проекты/метки и монтирует `QuickAdd` только после завершения посева,
 * на том же инстансе `StoragePort`, который получает сам экран. */
function Harness({
  projects = [],
  labels = [],
  onStorage,
}: {
  projects?: readonly Project[];
  labels?: readonly Label[];
  onStorage: (storage: StoragePort) => void;
}): ReactElement | null {
  const storage = useStorage();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    onStorage(storage);
  }, [storage, onStorage]);

  useEffect(() => {
    let cancelled = false;
    void seedProjects(storage, projects)
      .then(() => seedLabels(storage, labels))
      .then(() => {
        if (!cancelled) setSeeded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- фиксировано на монтирование теста
  }, [storage]);

  return seeded ? <QuickAdd /> : null;
}

function renderQuickAdd(
  origin: QuickAddOrigin,
  opts: { projects?: readonly Project[]; labels?: readonly Label[] } = {},
): {
  getStorage: () => StoragePort;
  controller: ReturnType<typeof createAppController>;
} {
  const controller = createAppController({ screen: 'todayEmpty', quickAdd: { origin } });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <Harness
        projects={opts.projects ?? []}
        labels={opts.labels ?? []}
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

async function inputField(): Promise<HTMLElement> {
  return screen.findByRole('textbox', { name: t('quickAdd', 'input.label') });
}

function submitButton(): HTMLElement {
  return screen.getByRole('button', { name: t('quickAdd', 'input.submitLabel') });
}

beforeEach(() => {
  localStorage.clear();
});

describe('QuickAdd — Empty state (M20)', () => {
  it('origin=inbox: фокус сразу на поле, унаследованного чипа даты нет', async () => {
    renderQuickAdd('inbox');
    const input = await inputField();

    expect(input).toHaveFocus();
    expect(screen.queryByText(t('quickAdd', 'chips.today'))).not.toBeInTheDocument();
  });

  it('origin=today: унаследованный чип «Сегодня» виден сразу', async () => {
    renderQuickAdd('today');
    await inputField();

    expect(screen.getByText(t('quickAdd', 'chips.today'))).toBeInTheDocument();
  });

  it('пустой ввод не создаёт задачу — кнопка отправки недоступна', async () => {
    const { getStorage } = renderQuickAdd('inbox');
    await inputField();

    expect(submitButton()).toBeDisabled();
    await waitFor(async () => {
      const inboxTasks = await getStorage().tasks.listByCaptureStateAndStatus('inbox', 'active');
      expect(inboxTasks).toHaveLength(0);
    });
  });
});

describe('QuickAdd — NLP Parsed (M21)', () => {
  it('распознаёт проект/метку/приоритет разом, заголовок очищен от распознанных фрагментов', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'now' });
    renderQuickAdd('global', { projects: [project] });
    const input = await inputField();

    await user.type(input, 'Купить #now @потом !2');

    expect(await screen.findByText('now')).toBeInTheDocument();
    expect(screen.getByText('потом')).toBeInTheDocument();
    expect(screen.getByText(t('quickAdd', 'chips.priorityP2'))).toBeInTheDocument();
    expect(screen.getByText('Купить')).toBeInTheDocument();
  });

  it('снятие явного чипа возвращает исходный текст на своё место в заголовке', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'now' });
    renderQuickAdd('global', { projects: [project] });
    const input = await inputField();

    await user.type(input, 'Купить #now @потом !2');
    await screen.findByText('now');

    await user.click(
      screen.getByRole('button', { name: t('quickAdd', 'chips.removeLabel', { text: '#now' }) }),
    );

    expect(await screen.findByText('Купить #now')).toBeInTheDocument();
  });

  it('снятие унаследованного чипа Today НЕ возвращает captureState в inbox (`01§3`)', async () => {
    const user = userEvent.setup();
    const { getStorage } = renderQuickAdd('today');
    const input = await inputField();
    await user.type(input, 'Позвонить маме');

    await user.click(screen.getByRole('button', { name: t('quickAdd', 'chips.todayRemoveLabel') }));
    await user.click(submitButton());

    await waitFor(async () => {
      const processed = await getStorage().tasks.listByCaptureStateAndStatus('processed', 'active');
      expect(processed).toHaveLength(1);
      expect(processed[0]?.plannedDate).toBeNull();
    });
    const inboxTasks = await getStorage().tasks.listByCaptureStateAndStatus('inbox', 'active');
    expect(inboxTasks).toHaveLength(0);
  });
});

describe('QuickAdd — Ambiguous (M22)', () => {
  it('невалидная дата отклоняется, чип не создаётся, точный текст остаётся в заголовке', async () => {
    const user = userEvent.setup();
    renderQuickAdd('global');
    const input = await inputField();

    await user.type(input, 'Встреча 30 февраля');

    expect(
      await screen.findByText(t('quickAdd', 'rejected.item', { text: '30 февраля' })),
    ).toBeInTheDocument();
    expect(screen.getByText('Встреча 30 февраля')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: t('quickAdd', 'chips.removeLabel', { text: '30 февраля' }),
      }),
    ).not.toBeInTheDocument();
  });
});

describe('QuickAdd — метки (find/create)', () => {
  it('существующая метка находится и назначается, несуществующая создаётся и назначается', async () => {
    const user = userEvent.setup();
    const existingLabel = makeLabel({ displayName: 'работа' });
    const { getStorage } = renderQuickAdd('global', { labels: [existingLabel] });
    const input = await inputField();

    await user.type(input, 'Написать статью @работа @идеи');
    await user.click(submitButton());

    await waitFor(async () => {
      const inboxTasks = await getStorage().tasks.listByCaptureStateAndStatus('inbox', 'active');
      expect(inboxTasks).toHaveLength(1);
    });
    const [task] = await getStorage().tasks.listByCaptureStateAndStatus('inbox', 'active');
    const allLabels = await getStorage().labels.listAll();
    expect(allLabels.filter((l) => l.normalizedName === 'работа')).toHaveLength(1);
    const created = allLabels.find((l) => l.normalizedName === 'идеи');
    expect(created).toBeDefined();

    const links = await getStorage().taskLabels.listByTask(task!.id);
    const linkedLabelIds = links.map((l) => l.labelId).toSorted();
    expect(linkedLabelIds).toEqual([existingLabel.id, created!.id].toSorted());
  });
});

describe('QuickAdd — проект (find only)', () => {
  it('существующий проект находится и назначается задаче', async () => {
    const user = userEvent.setup();
    const project = makeProject({ title: 'дом' });
    const { getStorage } = renderQuickAdd('global', { projects: [project] });
    const input = await inputField();

    await user.type(input, 'Купить корм #дом');
    await user.click(submitButton());

    await waitFor(async () => {
      const inboxTasks = await getStorage().tasks.listByCaptureStateAndStatus('inbox', 'active');
      expect(inboxTasks).toHaveLength(1);
      expect(inboxTasks[0]?.projectId).toBe(project.id);
    });
  });

  it('несуществующий проект показывает «не найден», проект не создаётся молча', async () => {
    const user = userEvent.setup();
    const { getStorage } = renderQuickAdd('global');
    const input = await inputField();

    await user.type(input, 'Купить корм #неизвестный');

    expect(
      await screen.findByText(t('quickAdd', 'chips.projectNotFound', { name: 'неизвестный' })),
    ).toBeInTheDocument();

    await user.click(submitButton());

    await waitFor(async () => {
      const inboxTasks = await getStorage().tasks.listByCaptureStateAndStatus('inbox', 'active');
      expect(inboxTasks).toHaveLength(1);
      expect(inboxTasks[0]?.projectId).toBeNull();
    });
    expect(await getStorage().projects.listActive()).toHaveLength(0);
  });
});

describe('QuickAdd — recurrence (честный вырез, эпик E11 не начат)', () => {
  it('чип повтора показан disabled, текст остаётся в заголовке, задача создаётся без повтора', async () => {
    const user = userEvent.setup();
    const { getStorage } = renderQuickAdd('global');
    const input = await inputField();

    await user.type(input, 'Зарядка каждый день');

    expect(screen.getByText(t('quickAdd', 'chips.recurrenceComingSoon'))).toBeInTheDocument();
    expect(screen.getByText('Зарядка каждый день')).toBeInTheDocument();

    await user.click(submitButton());

    await waitFor(async () => {
      const inboxTasks = await getStorage().tasks.listByCaptureStateAndStatus('inbox', 'active');
      expect(inboxTasks).toHaveLength(1);
      expect(inboxTasks[0]?.title).toBe('Зарядка каждый день');
      expect(inboxTasks[0]?.seriesId).toBeNull();
    });
  });
});

describe('QuickAdd — отправка (M21 → создание)', () => {
  it('успешная отправка создаёт задачу с ожидаемыми полями, закрывает оверлей и очищает черновик', async () => {
    const user = userEvent.setup();
    const { getStorage, controller } = renderQuickAdd('global');
    const input = await inputField();

    await user.type(input, 'Оплатить счёт 5 сентября в 9:30 !1');
    await user.click(submitButton());

    await waitFor(() => expect(controller.getState().quickAdd).toBeNull());

    const inboxTasks = await getStorage().tasks.listByCaptureStateAndStatus('inbox', 'active');
    expect(inboxTasks).toHaveLength(1);
    const task = inboxTasks[0]!;
    expect(task.title).toBe('Оплатить счёт');
    expect(task.priority).toBe(1);
    expect(task.plannedDate?.toString()).toBe('2026-09-05');
    expect(task.plannedTime?.toString({ smallestUnit: 'minute' })).toBe('09:30');

    expect(localStorage.getItem('shagi:quickAdd:draft')).toBeNull();
  });
});

describe('QuickAdd — Draft safety (`01§3`)', () => {
  it('непустой ввод автосохраняется локально', async () => {
    const user = userEvent.setup();
    renderQuickAdd('inbox');
    const input = await inputField();

    await user.type(input, 'Черновик задачи');

    await waitFor(() => {
      const raw = localStorage.getItem('shagi:quickAdd:draft');
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual({ text: 'Черновик задачи' });
    });
  });

  it('Escape (закрытие оверлея) не стирает черновик', async () => {
    const user = userEvent.setup();
    const { controller } = renderQuickAdd('inbox');
    const input = await inputField();

    await user.type(input, 'Не потерять');
    await user.keyboard('{Escape}');

    expect(controller.getState().quickAdd).toBeNull();
    expect(localStorage.getItem('shagi:quickAdd:draft')).not.toBeNull();
  });

  it('повторное открытие с непустым черновиком предлагает Продолжить/Удалить, Продолжить восстанавливает текст', async () => {
    const user = userEvent.setup();
    localStorage.setItem('shagi:quickAdd:draft', JSON.stringify({ text: 'Старый черновик' }));

    renderQuickAdd('inbox');

    const continueButton = await screen.findByRole('button', {
      name: t('quickAdd', 'draftPrompt.continue'),
    });
    expect(
      screen.getByRole('button', { name: t('quickAdd', 'draftPrompt.discard') }),
    ).toBeInTheDocument();

    await user.click(continueButton);

    const input = await inputField();
    expect(input).toHaveValue('Старый черновик');
  });

  it('Удалить в подсказке о черновике очищает сохранённый текст, поле остаётся пустым', async () => {
    const user = userEvent.setup();
    localStorage.setItem('shagi:quickAdd:draft', JSON.stringify({ text: 'Старый черновик' }));

    renderQuickAdd('inbox');
    await user.click(
      await screen.findByRole('button', { name: t('quickAdd', 'draftPrompt.discard') }),
    );

    const input = await inputField();
    expect(input).toHaveValue('');
    expect(localStorage.getItem('shagi:quickAdd:draft')).toBeNull();
  });
});
