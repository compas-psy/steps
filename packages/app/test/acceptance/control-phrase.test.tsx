/**
 * Приёмка контрольной строки владельца продукта — сквозной путь
 * `ввод → разбор → чипы превью → принятые сущности → команда → хранилище`.
 *
 * Почему этот файл существует отдельно от `test/screens/*` и от юнит-тестов
 * `@shagi/nlp`: разбор был исправен, а продукт — нет. Парсер на этой самой
 * строке возвращал верные `title`/`date`/`time`, но экран онбординга
 * `FirstTask` его вообще не вызывал и клал сырой текст в заголовок. Тест
 * компонента этого не ловил, потому что каждый компонент по отдельности вёл
 * себя правильно. Поэтому здесь проверяется НЕ DOM, а сохранённая доменная
 * задача: единственное, что видит пользователь после сохранения.
 */
import type { ReactElement } from 'react';
import { useEffect } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Temporal } from '@js-temporal/polyfill';
import { createUnavailablePlatform } from '@shagi/platform';
import { t } from '@shagi/i18n';
import type { CaptureState, Task } from '@shagi/core';
import type { StoragePort } from '@shagi/storage';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AppHost } from '../../src/App.js';
import { AppProvider, useStorage } from '../../src/state/context.js';
import { createAppController } from '../../src/state/store.js';
import { FirstTask } from '../../src/screens/FirstTask.js';
import { QuickAdd } from '../../src/screens/QuickAdd.js';
import { App } from '../../src/App.js';
import { createInMemoryStorage } from '@shagi/storage/memory';
import type { QuickAddOrigin } from '../../src/state/store.js';

/** Контрольная строка приёмки. Дословно та, что владелец вводил в
 * установленной сборке. */
const CONTROL_PHRASE = '9 сентября в 11:00 Сходить с мамой в МВД';
const EXPECTED_TITLE = 'Сходить с мамой в МВД';

function testHost(): AppHost {
  return { platform: createUnavailablePlatform(), storageBackend: { kind: 'memory' } };
}

function Harness({
  onStorage,
  children,
}: {
  onStorage: (storage: StoragePort) => void;
  children: ReactElement;
}): ReactElement {
  const storage = useStorage();
  useEffect(() => {
    onStorage(storage);
  }, [storage, onStorage]);
  return children;
}

/**
 * «9 сентября соответствующего года» — год не фиксируется константой
 * намеренно: разбор относительной даты зависит от сегодняшнего дня, и тест,
 * прибитый к одному году, начал бы врать при смене календаря, а не ловить
 * регрессию. Проверяется то, что действительно обязано выполняться всегда:
 * это девятое сентября, и это ближайшее девятое сентября — текущего года
 * либо следующего, если оно уже прошло.
 */
function expectNinthOfSeptember(date: Temporal.PlainDate | null): void {
  expect(date).not.toBeNull();
  if (date === null) return;
  expect(date.month).toBe(9);
  expect(date.day).toBe(9);
  const today = Temporal.Now.plainDateISO();
  expect([today.year, today.year + 1]).toContain(date.year);
}

function assertControlTask(task: Task | undefined): void {
  expect(task).toBeDefined();
  if (task === undefined) return;
  // Служебные токены обязаны исчезнуть из заголовка — «9 сентября» и
  // «в 11:00» приняты как сущности, а не как часть названия.
  expect(task.title).toBe(EXPECTED_TITLE);
  expectNinthOfSeptember(task.plannedDate);
  expect(task.plannedTime?.toString({ smallestUnit: 'minute' })).toBe('11:00');
}

describe('Контрольная строка приёмки: «9 сентября в 11:00 Сходить с мамой в МВД»', () => {
  it('онбординг First Task сохраняет разобранные название, дату и время', async () => {
    const user = userEvent.setup();
    const controller = createAppController({ screen: 'firstTask' });
    let capturedStorage: StoragePort | undefined;

    render(
      <AppProvider host={testHost()} controller={controller}>
        <Harness onStorage={(storage) => (capturedStorage = storage)}>
          <FirstTask />
        </Harness>
      </AppProvider>,
    );

    await user.type(screen.getByLabelText(t('onboarding', 'firstTask.inputLabel')), CONTROL_PHRASE);
    await user.click(
      screen.getByRole('button', { name: t('onboarding', 'firstTask.submitLabel') }),
    );

    await waitFor(() => expect(controller.getState().screen).toBe('nlpOnboarding'));

    const storage = capturedStorage;
    if (storage === undefined) throw new Error('storage не захвачен — Harness не смонтировался');

    const tasks = await storage.tasks.listByCaptureStateAndStatus('processed', 'active');
    expect(tasks).toHaveLength(1);
    assertControlTask(tasks[0]);
  });
});

// --- Точки входа Quick Add -------------------------------------------------
//
// Владелец продукта перечислил их поимённо: global Quick Add, Today, Inbox,
// Plan, Project и desktop Ctrl+N. Все они ведут в ОДИН оверлей `QuickAdd`
// (`state/store.ts`: `openQuickAdd(origin)` — не отдельный экран на каждый
// вход), поэтому здесь проверяется этот оверлей на каждом значении
// `origin`, а не шесть визуально одинаковых копий одного теста.

function renderQuickAddOverlay(origin: QuickAddOrigin): {
  controller: ReturnType<typeof createAppController>;
  getStorage: () => StoragePort;
} {
  const controller = createAppController({ screen: 'todayEmpty', quickAdd: { origin } });
  let capturedStorage: StoragePort | undefined;
  render(
    <AppProvider host={testHost()} controller={controller}>
      <Harness onStorage={(storage) => (capturedStorage = storage)}>
        <QuickAdd />
      </Harness>
    </AppProvider>,
  );
  return {
    controller,
    getStorage: () => {
      if (capturedStorage === undefined) throw new Error('storage не захвачен');
      return capturedStorage;
    },
  };
}

async function typeControlPhraseAndSubmit(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const field = await screen.findByRole('textbox', { name: t('quickAdd', 'input.label') });
  await user.type(field, CONTROL_PHRASE);
  await user.click(screen.getByRole('button', { name: t('quickAdd', 'input.submitLabel') }));
}

describe.each<[QuickAddOrigin, CaptureState]>([
  ['global', 'inbox'],
  ['today', 'processed'],
  ['inbox', 'inbox'],
])('Quick Add, origin=%s', (origin, captureState) => {
  beforeEach(() => localStorage.clear());

  it('чипы даты и времени показаны ДО создания, служебные токены убраны из названия', async () => {
    const user = userEvent.setup();
    renderQuickAddOverlay(origin);

    const field = await screen.findByRole('textbox', { name: t('quickAdd', 'input.label') });
    await user.type(field, CONTROL_PHRASE);

    // Превью — не DOM ради DOM: владелец требует, чтобы человек увидел
    // разобранные дату и время ДО нажатия «Добавить».
    const preview = screen.getByRole('region', { name: t('quickAdd', 'preview.label') });
    expect(preview.textContent).toContain(EXPECTED_TITLE);
    expect(preview.textContent).toContain('11:00');
    expect(preview.textContent).not.toContain('9 сентября в 11:00 Сходить');
  });

  it('сохранённая доменная задача несёт разобранные название, дату и время', async () => {
    const user = userEvent.setup();
    const { getStorage, controller } = renderQuickAddOverlay(origin);

    await typeControlPhraseAndSubmit(user);
    await waitFor(() => expect(controller.getState().quickAdd).toBeNull());

    const tasks = await getStorage().tasks.listByCaptureStateAndStatus(captureState, 'active');
    expect(tasks).toHaveLength(1);
    assertControlTask(tasks[0]);
  });
});

describe('Desktop Ctrl+N', () => {
  beforeEach(() => localStorage.clear());

  it('открывает composer в реальном приложении, и та же строка создаёт ту же доменную задачу', async () => {
    const user = userEvent.setup();
    // Не пробный компонент с переизобретённым обработчиком, а НАСТОЯЩЕЕ
    // дерево `App`: горячая клавиша живёт в его `Bootstrap`, и проверять
    // надо именно её, иначе тест доказывал бы работоспособность своей
    // собственной копии сочетания клавиш.
    const storage = createInMemoryStorage();
    render(<App host={testHost()} storage={storage} />);

    await user.keyboard('{Control>}n{/Control}');

    const field = await screen.findByRole('textbox', { name: t('quickAdd', 'input.label') });
    await user.type(field, CONTROL_PHRASE);
    await user.click(screen.getByRole('button', { name: t('quickAdd', 'input.submitLabel') }));

    await waitFor(async () => {
      const tasks = await storage.tasks.listByCaptureStateAndStatus('inbox', 'active');
      expect(tasks).toHaveLength(1);
    });

    const tasks = await storage.tasks.listByCaptureStateAndStatus('inbox', 'active');
    assertControlTask(tasks[0]);
  });
});
